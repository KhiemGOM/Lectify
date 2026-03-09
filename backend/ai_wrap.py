"""
ai_wrap.py — High-level wrappers for file and chunk retrieval.

Provides simple fetch helpers that consolidate Firestore access,
so route handlers and other services can get file data in one call.
"""

from __future__ import annotations

from typing import Any, Optional

from .firebase_utils import (
    get_raw_file,
    list_chunks,
)


def fetch_file(
    *,
    user_id: str,
    subject_id: str,
    file_id: str,
) -> Optional[dict[str, Any]]:
    """
    Fetch a raw file document from Firestore.

    Returns the full document dict (including raw_text, sections,
    filename, file_type, created_at) or None if not found.
    """
    return get_raw_file(user_id=user_id, subject_id=subject_id, file_id=file_id)


def fetch_file_chunks(
    *,
    user_id: str,
    subject_id: str,
    file_id: str,
) -> list[dict[str, Any]]:
    """
    Fetch all chunks for a given file from Firestore.

    Returns a list of chunk dicts, each containing:
      chunk_id, file_id, chunk_begin, chunk_end, chunk_summary, raw_text
    """
    return list_chunks(user_id=user_id, subject_id=subject_id, file_id=file_id)


def fetch_file_with_chunks(
    *,
    user_id: str,
    subject_id: str,
    file_id: str,
) -> Optional[dict[str, Any]]:
    """
    Fetch a raw file document together with all its chunks in one call.

    Returns the file dict with an added 'chunks' key, or None if the file
    does not exist.
    """
    file_doc = fetch_file(user_id=user_id, subject_id=subject_id, file_id=file_id)
    if file_doc is None:
        return None

    chunks = fetch_file_chunks(user_id=user_id, subject_id=subject_id, file_id=file_id)
    return {**file_doc, "chunks": chunks}
