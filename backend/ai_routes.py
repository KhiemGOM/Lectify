from __future__ import annotations

import traceback
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

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
        f"Section {sec.get('section_id', '')}:\n{sec.get('content', '')}" for sec in included
    ).strip()


@router.post("/slides", response_model=FileUploadResponse)
async def upload_slides(
    user_id: str = Form(default="default_user"),
    subject_id: str = Form(default="default_subject"),
    file: UploadFile = File(...),
):
    stage = "start"
    try:
        stage = "process_uploaded_file"
        print(
            f"[upload_slides] stage={stage} user_id={user_id} subject_id={subject_id} filename={file.filename}",
            flush=True,
        )
        processed = await process_uploaded_file(file)
        file_id = str(uuid4())
        created_at = _utc_now_iso()

        stage = "upsert_raw_file"
        print(f"[upload_slides] stage={stage} file_id={file_id}", flush=True)
        upsert_raw_file(
            user_id=user_id,
            subject_id=subject_id,
            file_id=file_id,
            file=processed["raw_text"],
            filename=processed["filename"],
            file_type=processed["file_type"],
            raw_text=processed["raw_text"],
            sections=processed["sections"],
            created_at=created_at,
        )

        stage = "generate_chunks"
        print(
            f"[upload_slides] stage={stage} sections={len(processed['sections'])}",
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
            chunk_text = _build_chunk_text(processed["sections"], chunk_begin, chunk_end)
            summary = generate_summary(chunk_text) if chunk_text else ""

            stage = "upsert_chunk"
            print(
                f"[upload_slides] stage={stage} chunk_id={chunk_id} begin={chunk_begin} end={chunk_end}",
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
                raw_text=chunk_text,
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
            f"[upload_slides] stage={stage} file_id={file_id} chunks={len(chunks)}",
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
            f"[upload_slides] ERROR stage={stage} type={type(exc).__name__} msg={exc}",
            flush=True,
        )
        print(traceback.format_exc(), flush=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/slides", response_model=list[FileSummary])
def get_all_slides(
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


@router.get("/slides/{slide_id}", response_model=FileDetail)
def get_slide(
    slide_id: str,
    user_id: str = Query(default="default_user"),
    subject_id: str = Query(default="default_subject"),
):
    row = get_raw_file(user_id=user_id, subject_id=subject_id, file_id=slide_id)
    if not row:
        raise HTTPException(status_code=404, detail="Slide not found")

    chunk_rows = list_chunks(user_id=user_id, subject_id=subject_id, file_id=slide_id)
    chunks = [
        ChunkResponse(
            chunk_id=c.get("chunk_id", c.get("id", "")),
            file_id=slide_id,
            filename=c.get("filename", row.get("filename", slide_id)),
            chunk_begin=int(c.get("chunk_begin", 0)),
            chunk_end=int(c.get("chunk_end", 0)),
            summary=c.get("chunk_summary", ""),
        )
        for c in chunk_rows
    ]

    return FileDetail(
        file_id=slide_id,
        filename=row.get("filename", slide_id),
        file_type=row.get("file_type", "txt"),
        created_at=row.get("created_at", ""),
        chunks=chunks,
    )


@router.post("/quiz/generate", response_model=QuestionResponse)
def generate_quiz(
    payload: GenerateQuizRequest,
):
    try:
        user_id = payload.user_id
        subject_id = payload.subject_id
        raw = generate_quiz_modular(
            payload.chunk_text,
            payload.topic_type,
            payload.format_type,
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
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/quiz/answer", response_model=AttemptResponse)
def answer_quiz(
    payload: SubmitAnswerRequest,
):
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
