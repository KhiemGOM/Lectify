from __future__ import annotations

import mimetypes
import traceback
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response

_FILES_DIR = Path("/tmp/dlw_files")
_FILES_DIR.mkdir(parents=True, exist_ok=True)

from .ai_service import (
    generate_chunks,
    generate_quiz_modular,
    generate_summary,
    grade_nonmcq_quiz,
)
from .document_processor import process_uploaded_file
from .firebase_utils import (
    COLL,
    get_past_quiz_by_id,
    get_raw_file,
    list_attempts,
    list_chunks,
    query_docs,
    upsert_attempt,
    upsert_chunk,
    upsert_doc,
    upsert_raw_file,
    delete_doc,
    _doc_id,
    upload_file_to_storage,
    download_file_from_storage,
    delete_file_from_storage, get_chunk,
)
from .schemas import (
    AnalyticsSummary,
    AttemptDetail,
    AttemptResponse,
    ChunkResponse,
    FileDetail,
    FileSummary,
    FileUploadResponse,
    GenerateQuizRequest,
    QuestionDetail,
    QuestionResponse,
    QuestionRaw,
    SubmitAnswerRequest,
)

router = APIRouter(tags=["core"])


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_int(value: object, default: int) -> int:
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def _build_chunk_text(sections: list[dict], chunk_begin: int, chunk_end: int) -> str:
    # CHUNKBEGIN/CHUNKEND are 1-based and inclusive.
    included = [
        sec for sec in sections if chunk_begin <= int(sec.get("section_id", 0)) <= chunk_end
    ]
    return "\n\n".join(
        f"Slide {sec.get('section_id', '')}:\n{sec.get('content', '')}" for sec in included
    ).strip()


def fetch_file(*, user_id: str, subject_id: str, file_id: str) -> dict | None:
    """
    Fetch a raw file document together with all its chunks.

    Returns the file dict with a 'chunks' key added, or None if not found.
    Each chunk dict contains: chunk_id, file_id, chunk_begin, chunk_end,
    chunk_summary, raw_text, filename.
    """
    file_doc = get_raw_file(user_id=user_id, subject_id=subject_id, file_id=file_id)
    if file_doc is None:
        return None
    chunks = list_chunks(user_id=user_id, subject_id=subject_id, file_id=file_id)
    return {**file_doc, "chunks": chunks}


@router.post("/files", response_model=FileUploadResponse)
async def upload_file(
        user_id: str = Form(default="default_user"),
        subject_id: str = Form(default="default_subject"),
        file: UploadFile = File(...),
):
    stage = "start"
    try:
        stage = "process_uploaded_file"
        print(
            f"[upload_file] stage={stage} user_id={user_id} subject_id={subject_id} filename={file.filename}",
            flush=True,
        )
        processed = await process_uploaded_file(file)
        file_id = str(uuid4())
        created_at = _utc_now_iso()

        # Upload file to Firebase Storage
        stage = "upload_to_storage"
        file_ext = processed["file_type"]
        storage_path = f"files/{user_id}/{subject_id}/{file_id}.{file_ext}"
        print(f"[upload_file] stage={stage} storage_path={storage_path}", flush=True)

        file_url = upload_file_to_storage(
            file_bytes=processed["file_bytes"],
            storage_path=storage_path,
            content_type=f"application/{file_ext}",
        )

        stage = "upsert_raw_file"
        print(f"[upload_file] stage={stage} file_id={file_id}", flush=True)
        upsert_raw_file(
            user_id=user_id,
            subject_id=subject_id,
            file_id=file_id,
            filename=processed["filename"],
            file_type=processed["file_type"],
            raw_text=processed["raw_text"],
            sections=processed["sections"],
            created_at=created_at,
            file_url=file_url,
            storage_path=storage_path,
        )

        stage = "generate_chunks"
        print(
            f"[upload_file] stage={stage} sections={len(processed['sections'])}",
            flush=True,
        )
        slides_text = "\n\n".join(
            f"Slide {sec['section_id']}:\n{sec['content']}" for sec in processed["sections"]
        )
        chunk_tokens = generate_chunks(slides_text, file_name=processed["filename"])

        chunks: list[ChunkResponse] = []
        max_section_id = max((int(sec.get("section_id", 0)) for sec in processed["sections"]), default=1)
        for token in chunk_tokens:
            stage = "per_chunk"
            chunk_id = str(uuid4())
            chunk_begin = _safe_int(token.get("CHUNKBEGIN"), 1)
            chunk_end = _safe_int(token.get("CHUNKEND"), chunk_begin)
            chunk_begin = max(1, min(chunk_begin, max_section_id))
            chunk_end = max(chunk_begin, min(chunk_end, max_section_id))
            summary = generate_summary(slides_text) if slides_text else ""

            stage = "upsert_chunk"
            print(
                f"[upload_file] stage={stage} chunk_id={chunk_id} begin={chunk_begin} end={chunk_end}",
                flush=True,
            )
            upsert_chunk(
                user_id=user_id,
                subject_id=subject_id,
                file_id=file_id,
                chunk_id=chunk_id,
                chunk_begin=chunk_begin,
                chunk_end=chunk_end,
                chunk_summary=summary,
                filename=processed["filename"],
                created_at=created_at,
            )

            chunks.append(
                ChunkResponse(
                    chunk_id=chunk_id,
                    file_id=file_id,
                    filename=processed["filename"],
                    chunk_begin=chunk_begin,
                    chunk_end=chunk_end,
                    summary=summary,
                )
            )

        stage = "return_response"
        print(
            f"[upload_file] stage={stage} file_id={file_id} chunks={len(chunks)}",
            flush=True,
        )
        return FileUploadResponse(
            slide_id=file_id,
            filename=processed["filename"],
            file_type=processed["file_type"],
            chunks=chunks,
        )
    except HTTPException:
        raise
    except Exception as exc:
        print(
            f"[upload_file] ERROR stage={stage} type={type(exc).__name__} msg={exc}",
            flush=True,
        )
        print(traceback.format_exc(), flush=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/files", response_model=list[FileSummary])
def get_all_files(
        user_id: str = Query(default="default_user"),
        subject_id: str = Query(default="default_subject"),
):
    rows = query_docs(
        COLL.raw_files,
        filters=(("user_id", "==", user_id), ("subject_id", "==", subject_id)),
    )
    return [
        FileSummary(
            file_id=row.get("file_id", ""),
            filename=row.get("filename", row.get("file_id", "")),
            file_type=row.get("file_type", "txt"),
            created_at=row.get("created_at", ""),
        )
        for row in rows
    ]


@router.get("/files/{file_id}", response_model=FileDetail)
def get_file(
        file_id: str,
        user_id: str = Query(default="default_user"),
        subject_id: str = Query(default="default_subject"),
):
    row = get_raw_file(user_id=user_id, subject_id=subject_id, file_id=file_id)
    if not row:
        raise HTTPException(status_code=404, detail="File not found")

    chunk_rows = list_chunks(user_id=user_id, subject_id=subject_id, file_id=file_id)
    chunks = [
        ChunkResponse(
            chunk_id=c.get("chunk_id", c.get("id", "")),
            file_id=file_id,
            filename=c.get("filename", row.get("filename", file_id)),
            chunk_begin=int(c.get("chunk_begin", 0)),
            chunk_end=int(c.get("chunk_end", 0)),
            summary=c.get("chunk_summary", ""),
        )
        for c in chunk_rows
    ]

    return FileDetail(
        file_id=file_id,
        filename=row.get("filename", file_id),
        file_type=row.get("file_type", "txt"),
        created_at=row.get("created_at", ""),
        chunks=chunks,
    )


@router.get("/files/{file_id}/download")
def download_file(
        file_id: str,
        user_id: str = Query(default="default_user"),
        subject_id: str = Query(default="default_subject"),
):
    """Download the original uploaded file."""
    row = get_raw_file(user_id=user_id, subject_id=subject_id, file_id=file_id)
    if not row:
        raise HTTPException(status_code=404, detail="File not found")

    # Try Firebase Storage first
    storage_path = row.get("storage_path")
    if storage_path:
        try:
            file_bytes = download_file_from_storage(storage_path)
            file_type = row.get("file_type", "pdf")
            mime_type = mimetypes.types_map.get(f".{file_type}", "application/octet-stream")

            return Response(
                content=file_bytes,
                media_type=mime_type,
                headers={
                    "Content-Disposition": f'inline; filename="{row.get("filename", file_id)}"',
                    "Cache-Control": "private, max-age=3600",
                },
            )
        except Exception as e:
            print(f"[download_file] Error downloading from storage: {e}", flush=True)

    # Fallback to disk for legacy files
    file_type = row.get("file_type", "pdf")
    disk_path = _FILES_DIR / f"{file_id}.{file_type}"

    if not disk_path.exists():
        raise HTTPException(status_code=404, detail="File not available")

    file_bytes = disk_path.read_bytes()
    mime_type = mimetypes.types_map.get(f".{file_type}", "application/octet-stream")

    return Response(
        content=file_bytes,
        media_type=mime_type,
        headers={
            "Content-Disposition": f'inline; filename="{row.get("filename", file_id)}"',
            "Cache-Control": "private, max-age=3600",
        },
    )


@router.delete("/files/{file_id}", status_code=204)
def delete_file(
        file_id: str,
        user_id: str = Query(default="default_user"),
        subject_id: str = Query(default="default_subject"),
):
    """Delete a file and all its chunks."""
    row = get_raw_file(user_id=user_id, subject_id=subject_id, file_id=file_id)
    if not row:
        raise HTTPException(status_code=404, detail="File not found")

    # Delete all chunks for this file
    chunk_rows = list_chunks(user_id=user_id, subject_id=subject_id, file_id=file_id)
    for chunk in chunk_rows:
        doc_id = chunk.get("id", "")
        if doc_id:
            delete_doc(COLL.chunks, doc_id)

    # Delete the raw_file document
    delete_doc(COLL.raw_files, _doc_id(user_id, subject_id, file_id))

    # Delete from Firebase Storage if present
    storage_path = row.get("storage_path")
    if storage_path:
        try:
            delete_file_from_storage(storage_path)
        except Exception as e:
            print(f"[delete_file] Error deleting from storage: {e}", flush=True)

    # Remove disk cache if present (legacy files)
    file_type = row.get("file_type", "pdf")
    disk_path = _FILES_DIR / f"{file_id}.{file_type}"
    if disk_path.exists():
        disk_path.unlink()


@router.post("/questions", response_model=QuestionResponse)
def generate_question(
        payload: GenerateQuizRequest,
):
    """Generate a new quiz question from chunk range."""
    try:
        user_id = payload.user_id
        subject_id = payload.subject_id

        # Fetch chunk from Firestore
        chunk = get_chunk(
            user_id=user_id,
            subject_id=subject_id,
            file_id=payload.file_id,
            chunk_id=payload.chunk_id,
        )
        if not chunk:
            raise HTTPException(status_code=404, detail="Chunk not found.")

        begin = chunk.get("chunk_begin")
        end = chunk.get("chunk_end")

        raw_file = get_raw_file(
            user_id=user_id,
            subject_id=subject_id,
            file_id=payload.file_id,
        )
        if not raw_file or not raw_file.get("sections"):
            raise HTTPException(status_code=404, detail="Raw file not found.")

        chunk_text = f"Slides {begin}–{end}:\n{_build_chunk_text(raw_file['sections'], begin, end)}"

        raw = generate_quiz_modular(
            chunk_text,
            payload.topic_type,
            payload.format_type,
            payload.difficulty,
            payload.model_name,
        )

        question_id = str(uuid4())
        created_at = _utc_now_iso()

        question_doc = {
            "question_id": question_id,
            "user_id": user_id,
            "subject_id": subject_id,
            "file_id": payload.file_id or "",
            "chunk_id": payload.chunk_id,
            "question_text": raw.get("question_text", ""),
            "options": raw.get("options", []),
            "answer": raw.get("answer") or "",
            "format_type": payload.format_type,
            "topic_type": payload.topic_type,
            "metadata": raw.get("metadata", {}),
            "created_at": created_at,
        }
        upsert_doc(COLL.past_quiz, question_id, question_doc)

        return QuestionResponse(
            question_id=question_id,
            raw=QuestionRaw(
                metadata=raw.get("metadata", {}),
                question_text=raw.get("question_text", ""),
                options=raw.get("options", []),
                answer=raw.get("answer"),
            ),
        )
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/attempts", response_model=AttemptResponse)
def submit_attempt(
        payload: SubmitAnswerRequest,
):
    """Submit and grade a quiz answer attempt."""
    user_id = payload.user_id
    subject_id = payload.subject_id
    question = get_past_quiz_by_id(payload.question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    if payload.question_type in {"MCQ", "TF", "MULTI"}:
        score = 10 if payload.user_answer == question.get("answer", "") else 0
    else:
        score = grade_nonmcq_quiz(
            question=question.get("question_text", ""),
            correct_answer=question.get("answer", ""),
            user_answer=payload.user_answer,
            model_name=payload.model_name,
        )

    attempt_id = str(uuid4())
    upsert_attempt(
        attempt_id=attempt_id,
        user_id=user_id,
        subject_id=subject_id,
        question_id=payload.question_id,
        file_id=payload.file_id or question.get("file_id"),
        question_text=question.get("question_text", ""),
        options=question.get("options", []),
        answer=question.get("answer", ""),
        user_answer=payload.user_answer,
        score=score,
        question_type=payload.question_type,
        attempted_at=_utc_now_iso(),
    )

    return AttemptResponse(attempt_id=attempt_id, question_id=payload.question_id, score=score)


@router.get("/questions/{question_id}", response_model=QuestionDetail)
def get_question_detail(question_id: str):
    row = get_past_quiz_by_id(question_id)
    if not row:
        raise HTTPException(status_code=404, detail="Question not found")
    return QuestionDetail(
        question_id=row.get("question_id", row.get("id", "")),
        file_id=row.get("file_id", ""),
        chunk_id=row.get("chunk_id"),
        question_text=row.get("question_text", ""),
        options=row.get("options", []),
        answer=row.get("answer", ""),
        format_type=row.get("format_type", "MCQ"),
        topic_type=row.get("topic_type", "Theory"),
        metadata=row.get("metadata", {}),
        created_at=row.get("created_at", ""),
    )


@router.get("/questions", response_model=list[QuestionDetail])
def get_all_questions(
        user_id: str = Query(default="default_user"),
        subject_id: str = Query(default="default_subject"),
):
    rows = query_docs(
        COLL.past_quiz,
        filters=(("user_id", "==", user_id), ("subject_id", "==", subject_id)),
    )
    return [
        QuestionDetail(
            question_id=r.get("question_id", r.get("id", "")),
            file_id=r.get("file_id", ""),
            chunk_id=r.get("chunk_id"),
            question_text=r.get("question_text", ""),
            options=r.get("options", []),
            answer=r.get("answer", ""),
            format_type=r.get("format_type", "MCQ"),
            topic_type=r.get("topic_type", "Theory"),
            metadata=r.get("metadata", {}),
            created_at=r.get("created_at", ""),
        )
        for r in rows
    ]


@router.get("/attempts", response_model=list[AttemptDetail])
def get_attempts(
        user_id: str = Query(default="default_user"),
        subject_id: str = Query(default="default_subject"),
):
    rows = list_attempts(user_id=user_id, subject_id=subject_id)
    return [
        AttemptDetail(
            attempt_id=r.get("attempt_id", r.get("id", "")),
            question_id=r.get("question_id", ""),
            file_id=r.get("file_id"),
            question_text=r.get("question_text", ""),
            options=r.get("options", []),
            answer=r.get("answer", ""),
            user_answer=r.get("user_answer", ""),
            score=int(r.get("score", 0)),
            question_type=r.get("question_type", "MCQ"),
            attempted_at=r.get("attempted_at", ""),
        )
        for r in rows
    ]


@router.get("/analytics", response_model=AnalyticsSummary)
def get_analytics(
        user_id: str = Query(default="default_user"),
        subject_id: str = Query(default="default_subject"),
):
    attempts = list_attempts(user_id=user_id, subject_id=subject_id)
    questions = query_docs(
        COLL.past_quiz,
        filters=(("user_id", "==", user_id), ("subject_id", "==", subject_id)),
    )
    files = query_docs(
        COLL.raw_files,
        filters=(("user_id", "==", user_id), ("subject_id", "==", subject_id)),
    )

    scores = [int(a.get("score", 0)) for a in attempts]
    total_attempts = len(attempts)
    avg_score = (sum(scores) / total_attempts) if total_attempts else 0.0
    best_score = max(scores) if scores else 0

    return AnalyticsSummary(
        total_attempts=total_attempts,
        avg_score=avg_score,
        best_score=best_score,
        total_questions_generated=len(questions),
        total_files_uploaded=len(files),
    )
