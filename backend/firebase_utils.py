"""
Firebase (Firestore) interaction layer for the Python backend.

This module follows the "tables" (collections) you specified:
1) raw_files
   - user_id, subject_id, file_id, file
2) processed_slides
   - user_id, subject_id, file_id, slide_id, slides_content (str)
3) chunks
   - user_id, subject_id, file_id, chunk_id, chunk_begin (int), chunk_end (int), chunk_summary (str)
4) past_quiz
   - user_id, subject_id, citation [(slide_id, file_id)], question, options [], answer, user_answer, score (0-10)
5) user_subject_metadata
   - user_id, subject_id, custom_upload_prompt (str), custom_quiz_gen_prompt (str)

Auth (server-side):
- Use Firebase Admin SDK credentials (service account / ADC). The Firebase Web config
  (apiKey/authDomain/measurementId) is for client SDKs and is not used here.

Local dev:
- Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON file path.
- Optional: set FIREBASE_PROJECT_ID (defaults to "dlwsus").
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional, Sequence, Tuple

import firebase_admin
from dotenv import load_dotenv
from firebase_admin import credentials, firestore, storage
from google.cloud.firestore_v1.base_query import FieldFilter

# Load .env relative to this file (backend/.env)
load_dotenv(Path(__file__).parent / ".env")

Filter = Tuple[str, str, Any]  # (field, op, value)


@dataclass(frozen=True)
class Collections:
    raw_files: str = "raw_files"
    processed_slides: str = "processed_slides"
    chunks: str = "chunks"
    past_quiz: str = "past_quiz"
    attempts: str = "attempts"
    user_subject_metadata: str = "user_subject_metadata"
    subjects: str = "subjects"


COLL = Collections()


def init_firebase_admin(*, service_account_path: str | None = None, project_id: str | None = None) -> None:
    """
    Initialize Firebase Admin once per process. Safe to call multiple times.

    Credentials:
    - If GOOGLE_APPLICATION_CREDENTIALS (or service_account_path) is set, use it.
    - Otherwise fall back to Application Default Credentials (ADC).
    """
    if firebase_admin._apps:
        return

    service_account_path = service_account_path or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    project_id = project_id or os.getenv("FIREBASE_PROJECT_ID") or "dlwsus"

    creds_json = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    if creds_json:
        import json
        cred_dict = json.loads(creds_json)
        # anchor: cred_dict = json.loads(creds_json)
        # ↓ INSERT HERE
        import logging
        logging.warning(f"private_key first 100 chars: {repr(cred_dict['private_key'][:100])}")
        cred_dict["private_key"] = cred_dict["private_key"].replace("\\n", "\n")
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred, {
            "projectId": project_id,
            "storageBucket": f"{project_id}.firebasestorage.app"
        })
        return

    if service_account_path:
        resolved = Path(service_account_path)
        if not resolved.is_absolute():
            resolved = Path(__file__).parent / resolved
        cred = credentials.Certificate(str(resolved))
        firebase_admin.initialize_app(cred, {
            "projectId": project_id,
            "storageBucket": f"{project_id}.firebasestorage.app"
        })
        return

    firebase_admin.initialize_app(options={
        "projectId": project_id,
        "storageBucket": f"{project_id}.firebasestorage.app"
    })


def db() -> firestore.Client:
    init_firebase_admin()
    return firestore.client()


def get_storage_bucket():
    """Get the default Firebase Storage bucket."""
    init_firebase_admin()
    return storage.bucket()


def upload_file_to_storage(
        file_bytes: bytes,
        storage_path: str,
        content_type: str = "application/pdf",
) -> str:
    """
    Upload a file to Firebase Storage.

    Args:
        file_bytes: The file content as bytes
        storage_path: Path in storage (e.g., "files/user123/subject456/file789.pdf")
        content_type: MIME type of the file

    Returns:
        Public download URL for the file
    """
    bucket = get_storage_bucket()
    blob = bucket.blob(storage_path)
    blob.upload_from_string(file_bytes, content_type=content_type)

    # Make the blob publicly accessible (or use signed URLs for security)
    blob.make_public()
    return blob.public_url


def download_file_from_storage(storage_path: str) -> bytes:
    """
    Download a file from Firebase Storage.

    Args:
        storage_path: Path in storage (e.g., "files/user123/subject456/file789.pdf")

    Returns:
        File content as bytes
    """
    bucket = get_storage_bucket()
    blob = bucket.blob(storage_path)
    return blob.download_as_bytes()


def delete_file_from_storage(storage_path: str) -> None:
    """
    Delete a file from Firebase Storage.

    Args:
        storage_path: Path in storage (e.g., "files/user123/subject456/file789.pdf")
    """
    bucket = get_storage_bucket()
    blob = bucket.blob(storage_path)
    if blob.exists():
        blob.delete()


def _doc_id(*parts: str) -> str:
    # Deterministic id to avoid collisions across users/subjects.
    # Keep it ASCII and stable (no JSON encoding).
    return "::".join(parts)


# -----------------
# Generic Firestore
# -----------------

def get_doc(collection: str, doc_id: str) -> Optional[dict[str, Any]]:
    snap = db().collection(collection).document(doc_id).get()
    if not snap.exists:
        return None
    data = snap.to_dict() or {}
    if "id" in data:
        data["_doc_id"] = snap.id
    else:
        data["id"] = snap.id
    return data


def upsert_doc(collection: str, doc_id: str, data: dict[str, Any]) -> str:
    db().collection(collection).document(doc_id).set(data, merge=True)
    return doc_id


def add_doc(collection: str, data: dict[str, Any]) -> str:
    ref = db().collection(collection).document()
    ref.set(data)
    return ref.id


def delete_doc(collection: str, doc_id: str) -> None:
    db().collection(collection).document(doc_id).delete()


def query_docs(
        collection: str,
        *,
        filters: Sequence[Filter] = (),
        limit_n: int | None = None,
) -> list[dict[str, Any]]:
    q: Any = db().collection(collection)
    for field, op, value in filters:
        # Prefer keyword filter API to avoid firestore positional-arg warning.
        try:
            q = q.where(filter=FieldFilter(field, op, value))
        except TypeError:
            # Backward compatibility for older firestore clients.
            q = q.where(field, op, value)
    if limit_n is not None:
        q = q.limit(limit_n)

    out: list[dict[str, Any]] = []
    for snap in q.stream():
        row = snap.to_dict() or {}
        if "id" in row:
            row["_doc_id"] = snap.id
        else:
            row["id"] = snap.id
        out.append(row)
    return out


# ----------------------------
# 1) raw_files (collection)
# ----------------------------

def upsert_raw_file(
        *,
        user_id: str,
        subject_id: str,
        file_id: str,
        filename: str | None = None,
        file_type: str | None = None,
        raw_text: str | None = None,
        sections: list[dict[str, Any]] | None = None,
        created_at: str | None = None,
        file_url: str | None = None,
        storage_path: str | None = None,
) -> str:
    payload: dict[str, Any] = {
        "user_id": user_id,
        "subject_id": subject_id,
        "file_id": file_id,
    }
    if filename is not None:
        payload["filename"] = filename
    if file_type is not None:
        payload["file_type"] = file_type
    if raw_text is not None:
        payload["raw_text"] = raw_text
    if sections is not None:
        payload["sections"] = sections
    if created_at is not None:
        payload["created_at"] = created_at
    if file_url is not None:
        payload["file_url"] = file_url
    if storage_path is not None:
        payload["storage_path"] = storage_path

    doc_id = _doc_id(user_id, subject_id, file_id)
    return upsert_doc(COLL.raw_files, doc_id, payload)


def get_raw_file(*, user_id: str, subject_id: str, file_id: str) -> Optional[dict[str, Any]]:
    return get_doc(COLL.raw_files, _doc_id(user_id, subject_id, file_id))


# --------------------------------
# 2) processed_slides (collection)
# --------------------------------

def upsert_processed_slide(
        *,
        user_id: str,
        subject_id: str,
        file_id: str,
        slide_id: str,
        slides_content: str,
) -> str:
    doc_id = _doc_id(user_id, subject_id, file_id, slide_id)
    return upsert_doc(
        COLL.processed_slides,
        doc_id,
        {
            "user_id": user_id,
            "subject_id": subject_id,
            "file_id": file_id,
            "slide_id": slide_id,
            "slides_content": slides_content,
        },
    )


def list_processed_slides(
        *,
        user_id: str,
        subject_id: str,
        file_id: str,
        limit_n: int = 2000,
) -> list[dict[str, Any]]:
    return query_docs(
        COLL.processed_slides,
        filters=(
            ("user_id", "==", user_id),
            ("subject_id", "==", subject_id),
            ("file_id", "==", file_id),
        ),
        limit_n=limit_n,
    )


# -------------------------
# 3) chunks (collection)
# -------------------------

def upsert_chunk(
        *,
        user_id: str,
        subject_id: str,
        file_id: str,
        chunk_id: str,
        chunk_begin: int,
        chunk_end: int,
        chunk_summary: str,
        filename: str | None = None,
        created_at: str | None = None,
) -> str:
    payload: dict[str, Any] = {
        "user_id": user_id,
        "subject_id": subject_id,
        "file_id": file_id,
        "chunk_id": chunk_id,
        "chunk_begin": int(chunk_begin),
        "chunk_end": int(chunk_end),
        "chunk_summary": chunk_summary,
    }
    if filename is not None:
        payload["filename"] = filename
    if created_at is not None:
        payload["created_at"] = created_at

    doc_id = _doc_id(user_id, subject_id, file_id, chunk_id)
    return upsert_doc(COLL.chunks, doc_id, payload)


def list_chunks(
        *,
        user_id: str,
        subject_id: str,
        file_id: str,
        limit_n: int = 2000,
) -> list[dict[str, Any]]:
    return query_docs(
        COLL.chunks,
        filters=(
            ("user_id", "==", user_id),
            ("subject_id", "==", subject_id),
            ("file_id", "==", file_id),
        ),
        limit_n=limit_n,
    )


def get_chunk(*, user_id: str, subject_id: str, file_id: str, chunk_id: str) -> Optional[dict[str, Any]]:
    doc_id = _doc_id(user_id, subject_id, file_id, chunk_id)
    return get_doc(COLL.chunks, doc_id)


# ----------------------------
# 4) past_quiz (collection)
# ----------------------------

def add_past_quiz(
        *,
        user_id: str,
        subject_id: str,
        citation: list[tuple[str, str]],  # [(slide_id, file_id)]
        question: str,
        options: list[str],
        answer: str,
        user_answer: str,
        score: int,
        time_start: str | None = None,
        time_end: str | None = None,
) -> str:
    score_int = int(score)
    if score_int < 0 or score_int > 10:
        raise ValueError("score must be an integer from 0 to 10")

    # Store citations as a list of [slide_id, file_id] pairs (JSON-friendly).
    citation_pairs = [[slide_id, f_id] for (slide_id, f_id) in citation]

    data = {
        "user_id": user_id,
        "subject_id": subject_id,
        "citation": citation_pairs,
        "question": question,
        "options": options,
        "answer": answer,
        "user_answer": user_answer,
        "score": score_int,
    }

    if time_start:
        data["time_start"] = time_start
    if time_end:
        data["time_end"] = time_end

    return add_doc(COLL.past_quiz, data)


def list_past_quiz(
        *,
        user_id: str,
        subject_id: str,
        limit_n: int = 500,
) -> list[dict[str, Any]]:
    return query_docs(
        COLL.past_quiz,
        filters=(
            ("user_id", "==", user_id),
            ("subject_id", "==", subject_id),
        ),
        limit_n=limit_n,
    )


def get_past_quiz_by_id(question_id: str) -> Optional[dict[str, Any]]:
    return get_doc(COLL.past_quiz, question_id)


def upsert_attempt(
        *,
        attempt_id: str,
        user_id: str,
        subject_id: str,
        question_id: str,
        file_id: str | None,
        question_text: str,
        options: list[str],
        answer: str,
        user_answer: str,
        score: int,
        correct: int,
        question_type: str,
        attempted_at: str,
) -> str:
    payload = {
        "attempt_id": attempt_id,
        "user_id": user_id,
        "subject_id": subject_id,
        "question_id": question_id,
        "file_id": file_id,
        "question_text": question_text,
        "options": options,
        "answer": answer,
        "user_answer": user_answer,
        "score": int(score),
        "correct": correct,
        "question_type": question_type,
        "attempted_at": attempted_at,
    }
    return upsert_doc(COLL.attempts, attempt_id, payload)


def list_attempts(
        *,
        user_id: str,
        subject_id: str,
        limit_n: int = 500,
) -> list[dict[str, Any]]:
    return query_docs(
        COLL.attempts,
        filters=(
            ("user_id", "==", user_id),
            ("subject_id", "==", subject_id),
        ),
        limit_n=limit_n,
    )


# ----------------------------------
# 5) user_subject_metadata (collection)
# ----------------------------------

def upsert_user_subject_metadata(
        *,
        user_id: str,
        subject_id: str,
        custom_upload_prompt: str,
        custom_quiz_gen_prompt: str,
) -> str:
    doc_id = _doc_id(user_id, subject_id)
    return upsert_doc(
        COLL.user_subject_metadata,
        doc_id,
        {
            "user_id": user_id,
            "subject_id": subject_id,
            "custom_upload_prompt": custom_upload_prompt,
            "custom_quiz_gen_prompt": custom_quiz_gen_prompt,
        },
    )


def get_user_subject_metadata(
        *,
        user_id: str,
        subject_id: str,
) -> Optional[dict[str, Any]]:
    return get_doc(COLL.user_subject_metadata, _doc_id(user_id, subject_id))


def get_next_file_index(
        user_id: str,
        subject_id: str,
        filename_prefix: str,
) -> int:
    """
    Returns the next available index for a file in 'raw_files' collection
    for the given user+subject, using your Firestore helper functions.

    Args:
        user_id: User ID
        subject_id: Subject ID
        filename_prefix: File name prefix to count existing files

    Returns:
        int: next available index (starts from 1)
    """
    existing_files = query_docs(
        collection=COLL.raw_files,
        filters=[
            ("user_id", "==", user_id),
            ("subject_id", "==", subject_id),
            ("file_id", ">=", filename_prefix),
            ("file_id", "<", filename_prefix + "\uf8ff"),  # unicode trick for startsWith
        ],
    )
    return len(existing_files) + 1


# -------------------------
# 6) subjects (collection)
# -------------------------

def upsert_subject(
        *,
        user_id: str,
        session: dict[str, Any],
) -> str:
    """
    Upsert a subject/session document.

    Uses deterministic doc id: "{user_id}::{session_id}" to mirror previous
    frontend behavior and make lookups/deletes predictable.
    """
    session_id = str(session.get("id", "")).strip()
    if not session_id:
        raise ValueError("session.id is required")

    payload = {
        "userId": user_id,  # legacy/frontend-compatible field
        "user_id": user_id,  # backend-style field for consistency
        **session,
    }
    return upsert_doc(COLL.subjects, _doc_id(user_id, session_id), payload)


def list_subjects(*, user_id: str, limit_n: int = 1000) -> list[dict[str, Any]]:
    """
    List all subjects for a user.

    Primarily filters by `userId` for compatibility with existing data that was
    created from the frontend Firebase SDK.
    """
    rows = query_docs(
        COLL.subjects,
        filters=(("userId", "==", user_id),),
        limit_n=limit_n,
    )

    # Fallback for any rows written in backend snake_case form only.
    if not rows:
        rows = query_docs(
            COLL.subjects,
            filters=(("user_id", "==", user_id),),
            limit_n=limit_n,
        )
    return rows


def delete_subject(*, user_id: str, session_id: str) -> None:
    delete_doc(COLL.subjects, _doc_id(user_id, session_id))
