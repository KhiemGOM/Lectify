"""
schemas.py - all Pydantic models for request validation and response serialization.

This backend copy is aligned with the root-level schemas.py API contract.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from .model_config import DEFAULT_MODEL_NAME


class SectionSchema(BaseModel):
    section_id: int
    title: str
    content: str


class GenerateQuizRequest(BaseModel):
    """POST /questions - generate one question from slide range."""

    file_id: str
    chunk_id: str
    chunk_begin: int
    chunk_end: int
    topic_type: str = "Theory"
    format_type: str = "MCQ"
    difficulty: str = "Medium"
    context: str = ""
    model_name: str = DEFAULT_MODEL_NAME
    user_id: str = "default_user"
    subject_id: str = "default_subject"



class SubmitAnswerRequest(BaseModel):
    """POST /quiz/answer - submit and grade a single answer."""

    question_id: str
    user_answer: str
    question_type: str = "MCQ"  # "MCQ" | "TF" | "MULTI" | "TEXT"
    file_id: Optional[str] = None
    model_name: str = DEFAULT_MODEL_NAME
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
    """Response from POST /files."""

    file_id: str
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
    """Full file document returned from GET /files/{file_id}."""

    file_id: str
    filename: str
    file_type: str
    created_at: str
    chunks: List[ChunkResponse]


class FileSummary(BaseModel):
    """Lightweight file entry returned in GET /files list."""

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

class FailedQuestionsRequest(BaseModel):
    user_id: str
    subject_id: str
    format_types: list[str] | None = None
    topic_types: list[str] | None = None
    difficulties: list[str] | None = None
    limit: int = 20


class SubjectSession(BaseModel):
    id: str
    name: str = ""
    date: str = ""
    fileCount: int = 0
    files: list[dict[str, Any]] = Field(default_factory=list)
    context: str = ""
