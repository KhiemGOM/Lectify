"""
schemas.py — all Pydantic models for request validation and response serialisation.

Firestore document shapes are described in docstrings so they serve as the
source-of-truth for what lands in each collection.
"""

from __future__ import annotations

from typing import List, Optional, Dict, Any

from pydantic import BaseModel, Field


# ── Firestore document shapes (reference) ─────────────────────────────────────
#
# files/{file_id}
#   file_id       : str  (uuid)
#   user_id       : str | None
#   filename      : str
#   file_type     : str            # "pdf" | "pptx" | "docx" | "txt" | "md"
#   raw_text      : str
#   sections      : list[{section_id:int, title:str, content:str}]
#   created_at    : str            # ISO-8601 UTC
#
# chunks/{chunk_id}
#   chunk_id      : str  (uuid)
#   file_id       : str
#   user_id       : str | None
#   filename      : str
#   chunk_begin   : int            # first section index (1-based, inclusive)
#   chunk_end     : int            # last  section index (1-based, inclusive)
#   raw_text      : str            # joined content of covered sections
#   summary       : str
#   created_at    : str
#
# questions/{question_id}
#   question_id   : str  (uuid)
#   file_id       : str
#   chunk_id      : str | None
#   user_id       : str | None
#   question_text : str
#   options       : list[str]      # empty for TEXT questions
#   answer        : str            # index string ("0"–"3") for MCQ/TF; text for TEXT
#   format_type   : str            # "MCQ" | "TEXT"
#   topic_type    : str            # "Theory" | "Applied"
#   metadata      : dict           # raw AI metadata (SLIDE refs, TOPIC tags, etc.)
#   created_at    : str
#
# attempts/{attempt_id}
#   attempt_id    : str  (uuid)
#   user_id       : str | None
#   file_id       : str | None
#   question_id   : str
#   question_text : str
#   options       : list[str]
#   answer        : str            # correct answer
#   user_answer   : str
#   score         : int            # 0 – 10
#   question_type : str            # "MCQ" | "TEXT" | "TF" | "MULTI"
#   attempted_at  : str
# ──────────────────────────────────────────────────────────────────────────────


# ── Embedded sub-models ────────────────────────────────────────────────────────

class SectionSchema(BaseModel):
    section_id: int
    title: str
    content: str


# ── Request models ─────────────────────────────────────────────────────────────

class GenerateQuizRequest(BaseModel):
    """POST /quiz/generate — generate one question from a chunk of text."""
    chunk_text: str = Field(min_length=1)
    file_id: Optional[str] = None  # stored on the resulting question doc
    chunk_id: Optional[str] = None  # stored on the resulting question doc
    topic_type: str = "Theory"  # "Theory" | "Applied"
    format_type: str = "MCQ"  # "MCQ" | "TEXT"
    model_name: str = "gpt-4o-mini"


class SubmitAnswerRequest(BaseModel):
    """POST /quiz/answer — submit and grade a single answer."""
    question_id: str
    user_answer: str
    question_type: str = "MCQ"  # "MCQ" | "TF" | "MULTI" | "TEXT"
    file_id: Optional[str] = None  # stored on the attempt doc
    model_name: str = "gpt-4o-mini"


# ── Response models ────────────────────────────────────────────────────────────

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
    slide_id: str  # alias for file_id (kept for frontend compat)
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
