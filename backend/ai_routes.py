from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import List
import uuid

from .ai_service import generate_chunks, generate_quiz_modular, grade_quiz, generate_summary
from firebase_utils import (
    upsert_raw_file,
    upsert_processed_slide,
    list_processed_slides,
    upsert_chunk,
    list_chunks,
    add_past_quiz,
    list_past_quiz, get_raw_file, query_docs, COLL, get_next_file_index,
)

router = APIRouter(tags=["core"])


class QuizRequest(BaseModel):
    slide_id: str
    chunk_index: int
    topic_type: str = "Theory"
    format_type: str = "MCQ"
    model_name: str = "gpt-4o-mini"


class GradeRequest(BaseModel):
    question_id: str
    user_answer: str
    time_start : str
    time_end : str
    question_type: str = "MCQ"
    model_name: str = "gpt-4o-mini"


@router.get("/health")
def health_check():
    return {"status": "ok"}


@router.post("/slides")
async def upload_slides(user_id: str, subject_id: str, file: UploadFile = File(...)):
    try:
        content = await file.read()
        slides_text = content.decode("utf-8")
        # Compute the next index for this filename + user + subject
        index = get_next_file_index(
            user_id=user_id,
            subject_id=subject_id,
            filename_prefix=file.filename
        )

        # Generate unique file_id
        file_id = f"{file.filename}_{index}"

        # 1️⃣ Save raw file
        upsert_raw_file(user_id=user_id, subject_id=subject_id, file_id=file_id, file=slides_text)

        # 2️⃣ Generate structured chunks
        parsed_chunks = generate_chunks(slides_text, file_name=file.filename)
        enriched_chunks = []

        for idx, chunk in enumerate(parsed_chunks):
            chunk_text = chunk.get("content", "")
            summary = generate_summary(chunk_text, model_name="gpt-4o-mini")
            chunk_id = str(uuid.uuid4())
            upsert_chunk(
                user_id=user_id,
                subject_id=subject_id,
                file_id=file_id,
                chunk_id=chunk_id,
                chunk_begin=chunk.get("start", 0),
                chunk_end=chunk.get("end", len(chunk_text)),
                chunk_summary=summary.strip(),
            )
            enriched_chunks.append({
                "chunk_id": chunk_id,
                "content": chunk_text,
                "summary": summary.strip()
            })

        return {"file_id": file_id, "filename": file.filename, "chunks": enriched_chunks}

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/slides")
def get_all_slides(user_id: str = "default_user", subject_id: str = "default_subject"):
    try:
        files = list_processed_slides(user_id=user_id, subject_id=subject_id, file_id="")
        return {"slides": files}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/slides/{file_id}")
def get_slide(file_id: str, user_id: str = "default_user", subject_id: str = "default_subject"):
    try:
        slides = list_processed_slides(user_id=user_id, subject_id=subject_id, file_id=file_id)
        if not slides:
            raise HTTPException(status_code=404, detail="Slide not found")
        return {"slides": slides}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/quiz/generate")
def generate_quiz(payload: QuizRequest, user_id: str = "default_user", subject_id: str = "default_subject"):
    try:
        # fetch the chunk from database
        chunks = list_chunks(user_id=user_id, subject_id=subject_id, file_id=payload.slide_id)
        if payload.chunk_index >= len(chunks):
            raise HTTPException(status_code=404, detail="Chunk not found")
        chunk_text = chunks[payload.chunk_index]["chunk_summary"]

        raw = generate_quiz_modular(
            chunk_text,
            payload.topic_type,
            payload.format_type,
            payload.model_name,
        )

        question_id = str(uuid.uuid4())
        # save to past_quiz as a temporary placeholder (without user answer)
        add_past_quiz(
            user_id=user_id,
            subject_id=subject_id,
            citation=[(chunks[payload.chunk_index]["chunk_id"], payload.slide_id)],
            question=raw,
            options=[],
            answer="",  # you can add real answer after generation
            user_answer="",
            score=0,
        )

        return {"question_id": question_id, "raw": raw}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/quiz/answer")
def answer_quiz(payload: GradeRequest, user_id: str = "default_user", subject_id: str = "default_subject"):
    try:
        # fetch the question from past_quiz
        quizzes = list_past_quiz(user_id=user_id, subject_id=subject_id)
        quiz = next((q for q in quizzes if q.get("id") == payload.question_id), None)
        if not quiz:
            raise HTTPException(status_code=404, detail="Question not found")

        score = grade_quiz(
            quiz["question"],
            payload.user_answer,
            payload.question_type,
            payload.model_name,
        )

        # update the past_quiz with user answer and score
        add_past_quiz(
            user_id=user_id,
            subject_id=subject_id,
            citation=quiz["citation"],
            question=quiz["question"],
            options=quiz.get("options", []),
            answer=quiz.get("answer", ""),
            user_answer=payload.user_answer,
            score=score,
        )

        return {"score": score}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/questions")
def get_all_questions(user_id: str = "default_user", subject_id: str = "default_subject"):
    try:
        quizzes = list_past_quiz(user_id=user_id, subject_id=subject_id)
        return {"questions": quizzes}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@router.get("/file/{file_id}")
def get_file(file_id: str, user_id: str = "default_user", subject_id: str = "default_subject"):
    try:
        file_doc = get_raw_file(user_id=user_id, subject_id=subject_id, file_id=file_id)
        if not file_doc:
            raise HTTPException(status_code=404, detail="File not found")

        return {
            "file_id": file_doc["file_id"],
            "user_id": file_doc["user_id"],
            "subject_id": file_doc["subject_id"],
            "file_content": file_doc["file"],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

