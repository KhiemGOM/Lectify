"""
schemas.py - all Pydantic models for request validation and response serialization.

This backend copy is aligned with the root-level schemas.py API contract.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class SectionSchema(BaseModel):
    section_id: int
    title: str
    content: str


class GenerateQuizRequest(BaseModel):
    """POST /quiz/generate - generate one question from a chunk of text."""

    chunk_text: str = Field(min_length=1)
    file_id: Optional[str] = None
    chunk_id: Optional[str] = None
    topic_type: str = "Theory"  # "Theory" | "Applied"
    format_type: str = "MCQ"  # "MCQ" | "TEXT"
    model_name: str = "gpt-4o-mini"
    user_id: str = "default_user"
    subject_id: str = "default_subject"


class SubmitAnswerRequest(BaseModel):
    """POST /quiz/answer - submit and grade a single answer."""

    question_id: str
    user_answer: str
    question_type: str = "MCQ"  # "MCQ" | "TF" | "MULTI" | "TEXT"
    file_id: Optional[str] = None
    model_name: str = "gpt-4o-mini"
    user_id: str = "default_user"
    subject_id: str = "default_subject"


class ChunkResponse(BaseModel):
    """One chunk returned after file upload."""

    chunk_id: str
    file_id: str
    filename: str
    chunk_begin: int
    chunk_end: int
    summary: str


class FileUploadResponse(BaseModel):
    """Response from POST /slides."""

    slide_id: str
    filename: str
    file_type: str
    chunks: List[ChunkResponse]


class QuestionRaw(BaseModel):
    """The AI-generated question data nested inside QuestionResponse."""

    metadata: Dict[str, Any]
    question_text: str
    options: List[str]
    answer: Optional[str]


class QuestionResponse(BaseModel):
    """Response from POST /quiz/generate."""

    question_id: str
    raw: QuestionRaw


class QuestionDetail(BaseModel):
    """Full question document returned from GET /questions/{question_id}."""

    question_id: str
    file_id: str
    chunk_id: Optional[str]
    question_text: str
    options: List[str]
    answer: str
    format_type: str
    topic_type: str
    metadata: Dict[str, Any]
    created_at: str


class AttemptResponse(BaseModel):
    """Response from POST /quiz/answer."""

    attempt_id: str
    question_id: str
    score: int
    max_score: int = 10


class AttemptDetail(BaseModel):
    """Full attempt document returned from GET /attempts."""

    attempt_id: str
    question_id: str
    file_id: Optional[str]
    question_text: str
    options: List[str]
    answer: str
    user_answer: str
    score: int
    question_type: str
    attempted_at: str


class FileDetail(BaseModel):
    """Full file document returned from GET /slides/{slide_id}."""

    file_id: str
    filename: str
    file_type: str
    created_at: str
    chunks: List[ChunkResponse]


class FileSummary(BaseModel):
    """Lightweight file entry returned in GET /slides list."""

    file_id: str
    filename: str
    file_type: str
    created_at: str


class AnalyticsSummary(BaseModel):
    """Aggregate stats returned from GET /analytics."""

    total_attempts: int
    avg_score: float
    best_score: int
    total_questions_generated: int
    total_files_uploaded: int
