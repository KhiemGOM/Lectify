from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid

from .ai_service import (
    generate_chunks,
    generate_quiz_modular,
    grade_quiz, generate_summary,
)

router = APIRouter(tags=["core"])


class ChunksRequest(BaseModel):
    slides_text: str = Field(min_length=1)
    file_name: str = Field(min_length=1)
    model_name: str = "gpt-4o-mini"


class QuizRequest(BaseModel):
    chunk_text: str = Field(min_length=1)
    topic_type: str = "Theory"
    format_type: str = "MCQ"
    model_name: str = "gpt-4o-mini"


class GradeRequest(BaseModel):
    raw_quiz_text: str = Field(min_length=1)
    user_answer: str = ""
    question_type: str = "MCQ"
    model_name: str = "gpt-4o-mini"


@router.get("/health")
def health_check():
    return {"status": "ok"}


@router.post("/slides")
async def upload_slides(file: UploadFile = File(...)):
    try:
        content = await file.read()
        slides_text = content.decode("utf-8")

        slide_id = str(uuid.uuid4())

        # =====================================
        # 🔥 1️⃣ Generate Structured Chunks
        # =====================================
        parsed_chunks = generate_chunks(
            slides_text,
            file_name=file.filename,
        )
        enriched_chunks = []

        for chunk in parsed_chunks:
            chunk_text = chunk.get("content", "")

            summary = generate_summary(
                chunk_text,
                model_name="gpt-4o-mini"
            )

            enriched_chunks.append({
                **chunk,
                "summary": summary.strip()
            })

        # =====================================
        # 🗄 3️⃣ Save To Database
        # =====================================
        """ 
        db.slides.insert({
            "id": slide_id,
            "filename": file.filename,
            "raw_text": slides_text,
            "chunks": enriched_chunks
        })
        """

        return {
            "slide_id": slide_id,
            "filename": file.filename,
            "chunks": enriched_chunks,
        }

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@router.get("/slides")
def get_all_slides():
    try:
        # ============================
        # 🗄 DATABASE PSEUDO CODE
        # ============================
        """
        slides = db.slides.find_all()
        """

        slides = []  # replace later

        return {"slides": slides}

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@router.get("/slides/{slide_id}")
def get_slide(slide_id: str):
    try:
        # ============================
        # 🗄 DATABASE PSEUDO CODE
        # ============================
        """
        slide = db.slides.find_by_id(slide_id)
        if not slide:
            raise NotFoundError
        """

        slide = None  # replace later

        if not slide:
            raise HTTPException(status_code=404, detail="Slide not found")

        return slide

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/quiz/generate")
def generate_quiz(payload: QuizRequest):
    try:
        # ============================
        # 🗄 DATABASE PSEUDO CODE
        # ============================
        """
        slide = db.slides.find_by_id(payload.slide_id)
        chunk_text = slide["chunks"][payload.chunk_index]["content"]
        """

        chunk_text = "REPLACE WITH DB FETCHED CHUNK"

        raw = generate_quiz_modular(
            chunk_text,
            payload.topic_type,
            payload.format_type,
            payload.model_name,
        )

        question_id = str(uuid.uuid4())

        # ============================
        # 🗄 DATABASE PSEUDO CODE
        # ============================
        """
        db.questions.insert({
            "id": question_id,
            "slide_id": payload.slide_id,
            "chunk_index": payload.chunk_index,
            "raw_question": raw,
            "topic_type": payload.topic_type,
            "format_type": payload.format_type
        })
        """

        return {
            "question_id": question_id,
            "raw": raw
        }

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


class QuizAnswerRequest(BaseModel):
    question_id: str
    user_answer: str
    question_type: str = "MCQ"
    model_name: str = "gpt-4o-mini"


@router.post("/quiz/answer")
def answer_quiz(payload: QuizAnswerRequest):
    try:

        raw_question = "REPLACE WITH DB FETCHED QUESTION"

        score = grade_quiz(
            raw_question,
            payload.user_answer,
            payload.question_type,
            payload.model_name,
        )

        # ============================
        # 🗄 DATABASE PSEUDO CODE
        # ============================
        """
        db.answers.insert({
            "question_id": payload.question_id,
            "user_answer": payload.user_answer,
            "score": score
        })
        """

        return {"score": score}

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@router.get("/questions")
def get_all_questions():
    try:
        # ============================
        # 🗄 DATABASE PSEUDO CODE
        # ============================
        """
        questions = db.questions.find_all()
        """

        questions = []  # replace later

        return {"questions": questions}

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))