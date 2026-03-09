/* ── api.js — REST API client for the FastAPI backend ── */

const DEFAULT_API_BASE = 'http://127.0.0.1:8000';
export const API_BASE = (import.meta.env.VITE_API_BASE || DEFAULT_API_BASE).replace(/\/$/, '');

export async function loadSubjects(userId = 'default_user') {
    const url = `${API_BASE}/subjects?user_id=${encodeURIComponent(userId)}`;
    const res = await fetch(url);
    if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`Load subjects failed (${res.status}): ${detail}`);
    }
    return res.json();
}

export async function saveSubject(userId = 'default_user', session) {
    const sessionId = session?.id;
    if (!sessionId) {
        throw new Error('saveSubject requires session.id');
    }

    const url = `${API_BASE}/subjects/${encodeURIComponent(sessionId)}`
        + `?user_id=${encodeURIComponent(userId)}`;
    const res = await fetch(url, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(session),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`Save subject failed (${res.status}): ${detail}`);
    }
    return res.json();
}

export async function deleteSubject(userId = 'default_user', subjectId) {
    const url = `${API_BASE}/subjects/${encodeURIComponent(subjectId)}`
        + `?user_id=${encodeURIComponent(userId)}`;
    const res = await fetch(url, {method: 'DELETE'});
    if (!res.ok && res.status !== 404) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`Delete subject failed (${res.status}): ${detail}`);
    }
}

/**
 * Upload a file to the backend.
 * Returns { slide_id, filename, file_type, chunks: [{chunk_id, file_id, filename, chunk_begin, chunk_end, summary}] }
 */
export async function uploadSlides(file, context = '', userId = 'default_user', subjectId = 'default_subject') {
    const url = `${API_BASE}/files`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('user_id', userId);
    formData.append('subject_id', subjectId);
    formData.append('context', context);

    const res = await fetch(url, {
        method: 'POST',
        body: formData,
    });

    if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`Upload failed (${res.status}): ${detail}`);
    }
    return res.json();
}

/**
 * Generate a single quiz question from chunk text.
 * fileId   — file_id returned by POST /files
 * chunk    — chunk object from upload response ({chunk_id, summary, ...})
 * Returns { question_id, raw: { metadata, question_text, options, answer } }
 */
export async function generateQuestion(
    fileId,
    chunk,
    scopeType = 'Theory',
    formatType = 'MCQ',
    difficulty = 'Medium',
    context = '',
    userId = 'default_user',
    subjectId = 'default_subject',
) {
    if (!chunk) {
        throw new Error('Cannot generate question: No selected chunk');
    }

    const url = `${API_BASE}/questions`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            file_id: fileId,
            chunk_id: chunk?.chunk_id ?? null,
            chunk_begin: chunk?.chunk_begin ?? null,
            chunk_end: chunk?.chunk_end ?? null,
            topic_type: scopeType,
            format_type: formatType,
            difficulty: difficulty,
            context: context,
            user_id: userId,
            subject_id: subjectId,
        }),
    });

    if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`Question generation failed (${res.status}): ${detail}`);
    }

    return res.json();
}

/**
 * Delete an uploaded file and all its chunks from the backend.
 */
export async function deleteFile(fileId, userId = 'default_user', subjectId = 'default_subject') {
    const url = `${API_BASE}/files/${encodeURIComponent(fileId)}`
        + `?user_id=${encodeURIComponent(userId)}&subject_id=${encodeURIComponent(subjectId)}`;
    const res = await fetch(url, {method: 'DELETE'});
    if (!res.ok && res.status !== 404) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`Delete file failed (${res.status}): ${detail}`);
    }
}

/**
 * Submit and grade a quiz answer on the backend.
 * Returns { attempt_id, question_id, score }
 */
export async function gradeAnswer(
    questionId,
    userAnswer,
    questionType = 'MCQ',
    fileId = null,
    userId = 'default_user',
    subjectId = 'default_subject',
) {
    const url = `${API_BASE}/attempts`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            question_id: questionId,
            user_answer: String(userAnswer),
            question_type: questionType,
            file_id: fileId,
            user_id: userId,
            subject_id: subjectId,
        }),
    });

    if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`Answer submission failed (${res.status}): ${detail}`);
    }

    return res.json();
}

export async function downloadFile(fileId, userId, subjectId) {
    const url = `${API_BASE}/files/${encodeURIComponent(fileId)}/download`
        + `?user_id=${encodeURIComponent(userId)}&subject_id=${encodeURIComponent(subjectId)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
}

export async function fetchFailedQuestions(userId, subjectId, filters = {}) {
    const res = await fetch(`${API_BASE}/questions/failed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: userId,
            subject_id: subjectId,
            format_types: filters.types ?? null,
            topic_types: filters.scopes ?? null,
            difficulty: filters.difficulty ?? null,
            limit: filters.limit ?? 20,
        }),
    });
    if (!res.ok) throw new Error(`Fetch failed questions (${res.status})`);
    return res.json();
}

export async function fetchQuestionDetail(questionId) {
    const res = await fetch(`${API_BASE}/questions/${encodeURIComponent(questionId)}`);
    if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`Fetch question detail failed (${res.status}): ${detail}`);
    }
    return res.json();
}

export async function fetchAnalyticsHistory(
    userId = 'default_user',
    subjectId = 'default_subject',
    filters = {},
    offset = 0,
    limit = 10,
) {
    const params = new URLSearchParams({
        user_id: userId,
        subject_id: subjectId,
        range: filters.range ?? '30d',
        offset: String(offset),
        limit: String(limit),
    });

    if (filters.questionType && filters.questionType !== 'all') {
        params.set('question_type', filters.questionType);
    }
    if (filters.difficulty && filters.difficulty !== 'all') {
        params.set('difficulty', filters.difficulty);
    }
    if (filters.topicType && filters.topicType !== 'all') {
        params.set('topic_type', filters.topicType);
    }
    if (filters.fileId && filters.fileId !== 'all') {
        params.set('file_id', filters.fileId);
    }

    const res = await fetch(`${API_BASE}/analytics/history?${params.toString()}`);
    if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`Fetch analytics history failed (${res.status}): ${detail}`);
    }
    return res.json();
}

/**
 * Convert an API quiz response into the QuizPage question format.
 *
 * settingsType: "MCQ" | "TF" | "MULTI" | "TEXT"  (from user settings)
 * The backend is called with:
 *   MCQ   → format_type "MCQ"  → numeric index answer (0/1/2/3)
 *   TF    → format_type "MCQ"  → treated as 2-option MCQ in frontend
 *   MULTI → format_type "MCQ"  → treated as MCQ in frontend
 *   TEXT  → format_type "TEXT" → string answer
 */
export function mapApiQuestion(apiRes, settingsType, filename = null, chunk = null, fileId = null) {
    const {question_id, raw} = apiRes;
    const {question_text, options = [], answer, metadata} = raw;

    let finalOptions = options;
    let finalAnswer;

    if (settingsType === 'TEXT') {
        finalAnswer = typeof answer === 'string' ? answer : '';
    } else if (settingsType === 'TF') {
        finalOptions = ['True', 'False'];
        const idx = parseInt(answer, 10);
        finalAnswer = isNaN(idx) ? 0 : Math.min(idx, 1);
    } else if (settingsType === 'MULTI') {
        // Backend returns digit-concatenated string like "024" → parse to [0, 2, 4]
        const str = typeof answer === 'string' ? answer : String(answer ?? '');
        finalAnswer = str.split('').map(Number).filter((n) => !isNaN(n));
    } else {
        // MCQ — answer is a single numeric index
        const idx = parseInt(answer, 10);
        finalAnswer = isNaN(idx) ? 0 : idx;
    }

    let reference;
    let slideNums = null;

    const refName = filename || (fileId ? 'Reference' : null);
    if (refName) {
        const slideRef = metadata?.SLIDE;
        if (slideRef != null && slideRef !== '') {
            const slides = Array.isArray(slideRef) ? slideRef : [slideRef];
            slideNums = slides.map(Number).filter(n => !isNaN(n));
            const label = slides.length > 1 ? 'Slides' : 'Slide';
            reference = `${refName} — ${label} ${slides.join(', ')}`;
        } else if (chunk?.chunk_begin != null && chunk?.chunk_end != null) {
            slideNums = Array.from(
                {length: chunk.chunk_end - chunk.chunk_begin + 1},
                (_, i) => chunk.chunk_begin + i,
            );
            reference = `${refName} — Sections ${chunk.chunk_begin}–${chunk.chunk_end}`;
        } else {
            reference = refName;
        }
    }

    return {
        id: question_id,
        type: settingsType,
        format: 'TEXT',
        text: question_text || 'Question unavailable',
        options: finalOptions,
        answer: finalAnswer,
        ...(fileId !== null && {fileId}),
        ...(reference !== undefined && {reference}),
        ...(slideNums !== null && {slideNums}),
        ...(chunk?.raw_text && {slideText: chunk.raw_text}),
    };
}

