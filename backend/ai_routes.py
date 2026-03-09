from __future__ import annotations

import mimetypes
import traceback
from collections import defaultdict
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
    grade_quiz,
)
from .document_processor import process_uploaded_file
from .firebase_utils import (
    COLL,
    delete_subject,
    get_past_quiz_by_id,
    get_raw_file,
    list_subjects,
    list_attempts,
    list_chunks,
    query_docs,
    upsert_attempt,
    upsert_chunk,
    upsert_doc,
    upsert_subject,
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
    SubmitAnswerRequest, FailedQuestionsRequest, SubjectSession,
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


def _score_to_percent(value: object) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(100.0, n * 10.0))


def _parse_slide_refs(raw: object) -> list[int]:
    if raw is None:
        return []
    if isinstance(raw, int):
        return [raw] if raw > 0 else []
    if isinstance(raw, list):
        out: list[int] = []
        for item in raw:
            try:
                n = int(item)
            except (TypeError, ValueError):
                continue
            if n > 0:
                out.append(n)
        return out

    text = str(raw).strip()
    if not text:
        return []
    nums: list[int] = []
    cur = ""
    for ch in text:
        if ch.isdigit():
            cur += ch
        elif cur:
            nums.append(int(cur))
            cur = ""
    if cur:
        nums.append(int(cur))
    return [n for n in nums if n > 0]


def _parse_iso(value: object) -> datetime:
    raw = str(value or "").strip()
    if not raw:
        return datetime.fromtimestamp(0, tz=timezone.utc)
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return datetime.fromtimestamp(0, tz=timezone.utc)


def _in_date_range(ts: datetime, range_key: str) -> bool:
    if range_key == "all":
        return True
    day_map = {"7d": 7, "30d": 30, "90d": 90}
    days = day_map.get(range_key, 30)
    cutoff = datetime.now(timezone.utc).timestamp() - (days * 86400)
    return ts.timestamp() >= cutoff


def _build_enriched_attempts(
        user_id: str,
        subject_id: str,
        range_key: str = "30d",
        question_type: str | None = None,
        difficulty: str | None = None,
        topic_type: str | None = None,
        file_id: str | None = None,
) -> list[dict]:
    attempts = list_attempts(user_id=user_id, subject_id=subject_id)
    questions = query_docs(
        COLL.past_quiz,
        filters=(("user_id", "==", user_id), ("subject_id", "==", subject_id)),
    )
    files = query_docs(
        COLL.raw_files,
        filters=(("user_id", "==", user_id), ("subject_id", "==", subject_id)),
    )

    question_by_id = {
        str(q.get("question_id") or q.get("id") or ""): q for q in questions
    }
    file_name_by_id = {
        str(f.get("file_id", "")): str(f.get("filename") or f.get("file_id") or "Unknown")
        for f in files
    }

    enriched: list[dict] = []
    for a in attempts:
        qid = str(a.get("question_id", ""))
        q = question_by_id.get(qid, {})
        ts = _parse_iso(a.get("attempted_at"))
        if not _in_date_range(ts, range_key):
            continue

        q_type = str(q.get("format_type") or a.get("question_type") or "MCQ")
        q_diff = str(q.get("difficulty") or "")
        q_topic = str(q.get("topic_type") or "")
        a_file_id = str(a.get("file_id") or q.get("file_id") or "")
        q_meta = q.get("metadata", {}) if isinstance(q.get("metadata", {}), dict) else {}
        q_slides = _parse_slide_refs(q_meta.get("SLIDE"))

        if question_type and question_type != "all" and q_type != question_type:
            continue
        if difficulty and difficulty != "all" and q_diff != difficulty:
            continue
        if topic_type and topic_type != "all" and q_topic != topic_type:
            continue
        if file_id and file_id != "all" and a_file_id != file_id:
            continue

        score_percent = _score_to_percent(a.get("score", 0))
        correct = bool(a.get("correct", score_percent >= 70))
        enriched.append(
            {
                "attempt_id": str(a.get("attempt_id") or a.get("id") or ""),
                "question_id": qid,
                "attempted_at": ts,
                "score_percent": score_percent,
                "correct": correct,
                "user_answer": str(a.get("user_answer") or ""),
                "file_id": a_file_id,
                "file_name": file_name_by_id.get(a_file_id, "Unknown"),
                "question_text": str(q.get("question_text") or a.get("question_text") or ""),
                "question_type": q_type,
                "difficulty": q_diff,
                "topic_type": q_topic,
                "slides": q_slides,
            }
        )
    return enriched


@router.get("/subjects")
def get_subjects(
        user_id: str = Query(default="default_user"),
):
    rows = list_subjects(user_id=user_id)
    sessions = []
    for row in rows:
        # Keep response shape aligned with legacy frontend `subjects` docs.
        session = dict(row)
        session.pop("userId", None)
        session.pop("user_id", None)
        session.pop("_doc_id", None)
        sessions.append(session)
    return sorted(sessions, key=lambda s: s.get("date", ""), reverse=True)


@router.put("/subjects/{subject_id}", response_model=SubjectSession)
def put_subject(
        subject_id: str,
        payload: SubjectSession,
        user_id: str = Query(default="default_user"),
):
    # Ensure path and body ids stay consistent.
    if payload.id != subject_id:
        raise HTTPException(status_code=400, detail="subject_id does not match payload.id")

    try:
        upsert_subject(user_id=user_id, session=payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return payload


@router.delete("/subjects/{subject_id}", status_code=204)
def remove_subject(
        subject_id: str,
        user_id: str = Query(default="default_user"),
):
    delete_subject(user_id=user_id, session_id=subject_id)


@router.post("/files", response_model=FileUploadResponse)
async def upload_file(
        user_id: str = Form(default="default_user"),
        subject_id: str = Form(default="default_subject"),
        slides_context: str = '',
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
        chunk_tokens = generate_chunks(slides_text, file_name=processed["filename"], context=slides_context)

        chunks: list[ChunkResponse] = []
        max_section_id = max((int(sec.get("section_id", 0)) for sec in processed["sections"]), default=1)
        for token in chunk_tokens:
            stage = "per_chunk"
            chunk_id = str(uuid4())
            chunk_begin = _safe_int(token.get("CHUNKBEGIN"), 1)
            chunk_end = _safe_int(token.get("CHUNKEND"), chunk_begin)
            chunk_begin = max(1, min(chunk_begin, max_section_id))
            chunk_end = max(chunk_begin, min(chunk_end, max_section_id))
            summary = generate_summary(slides_text, slides_context) if slides_text else ""

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
            file_id=file_id,
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
            payload.context,
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
            "difficulty": payload.difficulty,
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


@router.post("/questions/failed")
def get_failed_questions(payload: FailedQuestionsRequest):
    try:
        attempts = list_attempts(
            user_id=payload.user_id,
            subject_id=payload.subject_id,
        )
        # Keep latest attempt per question, then include only currently-wrong questions.
        latest_by_question = {}
        for a in sorted(attempts, key=lambda x: x.get("attempted_at", ""), reverse=True):
            qid = a.get("question_id")
            if not qid:
                continue
            if qid not in latest_by_question:
                latest_by_question[qid] = a

        failed_unique = [a for a in latest_by_question.values() if not a.get("correct", False)]

        # Fetch actual questions
        questions = []
        for attempt in failed_unique[:payload.limit * 2]:
            q = get_past_quiz_by_id(attempt["question_id"])
            if not q:
                continue
            if payload.format_types and q.get("format_type") not in payload.format_types:
                continue
            if payload.topic_types and q.get("topic_type") not in payload.topic_types:
                continue
            if payload.difficulties and q.get("difficulty") not in payload.difficulties:
                continue
            questions.append(q)
            if len(questions) >= payload.limit:
                break

        return {"questions": questions}
    except Exception as exc:
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


    score = grade_quiz(
        question=question.get("question_text", ""),
        correct_answer=question.get("answer", ""),
        question_type=question.get("format_type", "MCQ"),
        user_answer=payload.user_answer,
        model_name=payload.model_name,
    )

    correct = score >= 5 if question.get("format_type", "MCQ") == "TEXT" else score >= 10

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
        correct=correct,
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


@router.get("/analytics/dashboard")
def get_analytics_dashboard(
        user_id: str = Query(default="default_user"),
        subject_id: str = Query(default="default_subject"),
        range_key: str = Query(default="30d", alias="range"),
        rolling_window: int = Query(default=10, ge=3, le=50),
        question_type: str | None = Query(default=None),
        difficulty: str | None = Query(default=None),
        topic_type: str | None = Query(default=None),
        file_id: str | None = Query(default=None),
        min_attempts: int = Query(default=3, ge=1, le=20),
        limit: int = Query(default=10, ge=3, le=50),
):
    enriched = _build_enriched_attempts(
        user_id=user_id,
        subject_id=subject_id,
        range_key=range_key,
        question_type=question_type,
        difficulty=difficulty,
        topic_type=topic_type,
        file_id=file_id,
    )

    enriched.sort(key=lambda x: x["attempted_at"])
    total = len(enriched)
    if total:
        avg_score = sum(x["score_percent"] for x in enriched) / total
        accuracy = (sum(1 for x in enriched if x["correct"]) / total) * 100.0
    else:
        avg_score = 0.0
        accuracy = 0.0

    rolling_points = []
    rolling_scores: list[float] = []
    for idx, item in enumerate(enriched):
        rolling_slice = enriched[max(0, idx - rolling_window + 1): idx + 1]
        rolling_avg = sum(x["score_percent"] for x in rolling_slice) / len(rolling_slice)
        rolling_scores.append(rolling_avg)
        rolling_points.append(
            {
                "attempted_at": item["attempted_at"].isoformat(),
                "score_percent": round(item["score_percent"], 2),
                "rolling_avg": round(rolling_avg, 2),
            }
        )

    if total:
        current_slice = enriched[max(0, total - rolling_window):]
        prev_end = max(0, total - rolling_window)
        prev_start = max(0, prev_end - rolling_window)
        prev_slice = enriched[prev_start:prev_end]
        current_rolling = sum(x["score_percent"] for x in current_slice) / len(current_slice)
        prev_rolling = (
            sum(x["score_percent"] for x in prev_slice) / len(prev_slice)
            if prev_slice else current_rolling
        )
    else:
        current_rolling = 0.0
        prev_rolling = 0.0

    improvement_pp = current_rolling - prev_rolling
    all_attempts_subject = sorted(
        list_attempts(user_id=user_id, subject_id=subject_id),
        key=lambda x: _parse_iso(x.get("attempted_at")),
    )
    best_streak = 0
    cur_streak = 0
    for a in all_attempts_subject:
        score_percent = _score_to_percent(a.get("score", 0))
        is_correct = bool(a.get("correct", score_percent >= 70))
        if is_correct:
            cur_streak += 1
            if cur_streak > best_streak:
                best_streak = cur_streak
        else:
            cur_streak = 0

    def build_bucket(items: list[dict], key_name: str, label_name: str):
        grouped = defaultdict(lambda: {"attempts": 0, "wrong": 0})
        for it in items:
            k = str(it.get(key_name) or "Unknown")
            grouped[k]["attempts"] += 1
            grouped[k]["wrong"] += 0 if it["correct"] else 1
        rows = []
        for k, v in grouped.items():
            attempts_n = v["attempts"]
            wrong_n = v["wrong"]
            accuracy_n = ((attempts_n - wrong_n) / attempts_n) * 100.0 if attempts_n else 0.0
            if attempts_n < min_attempts:
                continue
            rows.append(
                {
                    "type": label_name,
                    "key": k,
                    "attempts": attempts_n,
                    "wrong_count": wrong_n,
                    "accuracy": round(accuracy_n, 2),
                }
            )
        return rows

    bucket_rows = []
    bucket_rows.extend(build_bucket(enriched, "topic_type", "topic"))
    bucket_rows.extend(build_bucket(enriched, "question_type", "question_type"))
    bucket_rows.extend(build_bucket(enriched, "file_name", "file"))
    weak_items = sorted(bucket_rows, key=lambda x: (x["accuracy"], -x["wrong_count"]))[:limit]
    strong_items = sorted(bucket_rows, key=lambda x: (-x["accuracy"], -x["attempts"]))[:limit]

    q_grouped = defaultdict(lambda: {
        "question_text": "",
        "question_type": "",
        "difficulty": "",
        "topic_type": "",
        "file_name": "",
        "attempts": 0,
        "wrong": 0,
        "last_attempted_at": datetime.fromtimestamp(0, tz=timezone.utc),
        "latest_user_answer": "",
        "latest_correct": False,
        "latest_score_percent": 0.0,
    })
    for it in enriched:
        qid = it["question_id"] or "unknown"
        q_grouped[qid]["question_text"] = it["question_text"]
        q_grouped[qid]["question_type"] = it["question_type"]
        q_grouped[qid]["difficulty"] = it["difficulty"]
        q_grouped[qid]["topic_type"] = it["topic_type"]
        q_grouped[qid]["file_name"] = it["file_name"]
        q_grouped[qid]["attempts"] += 1
        q_grouped[qid]["wrong"] += 0 if it["correct"] else 1
        if it["attempted_at"] > q_grouped[qid]["last_attempted_at"]:
            q_grouped[qid]["last_attempted_at"] = it["attempted_at"]
            q_grouped[qid]["latest_user_answer"] = str(it.get("user_answer") or "")
            q_grouped[qid]["latest_correct"] = bool(it["correct"])
            q_grouped[qid]["latest_score_percent"] = float(it["score_percent"])

    most_missed = []
    for qid, v in q_grouped.items():
        attempts_n = int(v["attempts"])
        wrong_n = int(v["wrong"])
        if wrong_n <= 0:
            continue
        accuracy_n = ((attempts_n - wrong_n) / attempts_n) * 100.0 if attempts_n else 0.0
        most_missed.append(
            {
                "question_id": qid,
                "question_text": v["question_text"],
                "question_type": v["question_type"],
                "difficulty": v["difficulty"],
                "topic_type": v["topic_type"],
                "file_name": v["file_name"],
                "attempts": attempts_n,
                "wrong_count": wrong_n,
                "accuracy": round(accuracy_n, 2),
                "last_attempted_at": v["last_attempted_at"].isoformat(),
                "latest_user_answer": v["latest_user_answer"],
                "latest_correct": v["latest_correct"],
                "latest_score_percent": round(v["latest_score_percent"], 2),
            }
        )

    most_missed.sort(key=lambda x: (-x["wrong_count"], x["accuracy"]))
    most_missed = most_missed[:limit]

    now_utc = datetime.now(timezone.utc)
    review_candidates = []
    for item in most_missed:
        last_ts = _parse_iso(item.get("last_attempted_at"))
        days_ago = max(0.0, (now_utc - last_ts).total_seconds() / 86400.0)
        recency_bonus = 2.0 if days_ago <= 3 else 1.0 if days_ago <= 7 else 0.0
        priority_score = (item["wrong_count"] * 2.0) + ((100.0 - item["accuracy"]) / 20.0) + recency_bonus

        if item["wrong_count"] >= 2:
            reason = "Repeated misses"
        elif item["accuracy"] <= 60:
            reason = "Low accuracy"
        else:
            reason = "Recent miss"

        review_candidates.append({
            **item,
            "days_since_last_attempt": round(days_ago, 1),
            "reason": reason,
            "_priority_score": round(priority_score, 2),
        })

    review_queue = sorted(
        review_candidates,
        key=lambda x: (-x["_priority_score"], -x["wrong_count"], x["accuracy"]),
    )[:limit]
    for r in review_queue:
        r.pop("_priority_score", None)

    coverage_by_file: dict[str, dict] = {}
    for it in enriched:
        a_file_id = str(it.get("file_id") or "")
        if not a_file_id:
            continue
        slides = it.get("slides") or []
        if not slides:
            continue
        entry = coverage_by_file.setdefault(
            a_file_id,
            {
                "file_id": a_file_id,
                "file_name": it.get("file_name") or "Unknown",
                "slide_counts": defaultdict(int),
                "total_uses": 0,
            },
        )
        for s in slides:
            try:
                slide_n = int(s)
            except (TypeError, ValueError):
                continue
            if slide_n <= 0:
                continue
            entry["slide_counts"][slide_n] += 1
            entry["total_uses"] += 1

    coverage_files = []
    for _, entry in sorted(coverage_by_file.items(), key=lambda kv: str(kv[1].get("file_name", ""))):
        total_uses = int(entry["total_uses"]) or 1
        slides = []
        for slide_n in sorted(entry["slide_counts"].keys()):
            uses = int(entry["slide_counts"][slide_n])
            slides.append(
                {
                    "slide": slide_n,
                    "uses": uses,
                    "coverage_percent": round((uses / total_uses) * 100.0, 2),
                }
            )
        coverage_files.append(
            {
                "file_id": entry["file_id"],
                "file_name": entry["file_name"],
                "total_uses": int(entry["total_uses"]),
                "slides": slides,
            }
        )

    return {
        "overview": {
            "total_attempts": total,
            "overall_avg_score": round(avg_score, 2),
            "current_rolling_avg": round(current_rolling, 2),
            "previous_rolling_avg": round(prev_rolling, 2),
            "improvement_pp": round(improvement_pp, 2),
            "accuracy_percent": round(accuracy, 2),
            "rolling_window": rolling_window,
            "best_streak": int(best_streak),
        },
        "rolling_trend": rolling_points,
        "citation_coverage": {"files": coverage_files},
        "weak_strong": {
            "weak_items": weak_items,
            "strong_items": strong_items,
        },
        "most_missed_questions": most_missed,
        "review_queue": review_queue,
    }


@router.get("/analytics/history")
def get_analytics_history(
        user_id: str = Query(default="default_user"),
        subject_id: str = Query(default="default_subject"),
        range_key: str = Query(default="30d", alias="range"),
        question_type: str | None = Query(default=None),
        difficulty: str | None = Query(default=None),
        topic_type: str | None = Query(default=None),
        file_id: str | None = Query(default=None),
        offset: int = Query(default=0, ge=0),
        limit: int = Query(default=10, ge=1, le=100),
):
    enriched = _build_enriched_attempts(
        user_id=user_id,
        subject_id=subject_id,
        range_key=range_key,
        question_type=question_type,
        difficulty=difficulty,
        topic_type=topic_type,
        file_id=file_id,
    )

    enriched.sort(key=lambda x: x["attempted_at"], reverse=True)
    total = len(enriched)
    page = enriched[offset: offset + limit]

    items = [
        {
            "attempt_id": x["attempt_id"],
            "question_id": x["question_id"],
            "attempted_at": x["attempted_at"].isoformat(),
            "question_text": x["question_text"],
            "question_type": x["question_type"],
            "difficulty": x["difficulty"],
            "topic_type": x["topic_type"],
            "file_name": x["file_name"],
            "score_percent": round(float(x["score_percent"]), 2),
            "correct": bool(x["correct"]),
            "user_answer": x["user_answer"],
        }
        for x in page
    ]

    return {
        "items": items,
        "offset": offset,
        "limit": limit,
        "total": total,
        "has_more": (offset + len(items)) < total,
    }


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
