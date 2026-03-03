/* ── api.js — REST API client for the FastAPI backend ── */

export const API_BASE = 'http://127.0.0.1:8000';

/**
 * Upload a file to the backend.
 * Returns { slide_id, filename, file_type, chunks: [{chunk_id, file_id, filename, chunk_begin, chunk_end, summary}] }
 */
export async function uploadSlides(file, userId = 'default_user', subjectId = 'default_subject') {
  const url = `${API_BASE}/slides`;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('user_id', userId);
  formData.append('subject_id', subjectId);

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
 * fileId   — slide_id returned by POST /slides
 * chunk    — chunk object from upload response ({chunk_id, summary, ...})
 * Returns { question_id, raw: { metadata, question_text, options, answer } }
 */
export async function generateQuestion(
  fileId,
  chunk,
  topicType = 'Theory',
  formatType = 'MCQ',
  userId = 'default_user',
  subjectId = 'default_subject',
) {
  const chunkText = String(chunk?.raw_text || chunk?.summary || '').trim();
  if (!chunkText) {
    throw new Error('Cannot generate question: selected chunk has no summary text.');
  }

  const url = `${API_BASE}/quiz/generate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chunk_text: chunkText,
      file_id: fileId,
      chunk_id: chunk?.chunk_id ?? null,
      topic_type: topicType,
      format_type: formatType,
      model_name: 'gpt-4o-mini',
      user_id: userId,
      subject_id: subjectId,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Quiz generation failed (${res.status}): ${detail}`);
  }

  return res.json();
}

/**
 * Grade a quiz answer on the backend.
 * Returns { attempt_id, question_id, score, max_score }
 */
export async function gradeAnswer(
  questionId,
  userAnswer,
  questionType = 'MCQ',
  fileId = null,
  userId = 'default_user',
  subjectId = 'default_subject',
) {
  const url = `${API_BASE}/quiz/answer`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question_id: questionId,
      user_answer: String(userAnswer),
      question_type: questionType,
      file_id: fileId,
      model_name: 'gpt-4o-mini',
      user_id: userId,
      subject_id: subjectId,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Grading failed (${res.status}): ${detail}`);
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
export function mapApiQuestion(apiRes, settingsType) {
  const { question_id, raw } = apiRes;
  const { question_text, options = [], answer } = raw;

  let finalOptions = options;
  let finalAnswer;

  if (settingsType === 'TEXT') {
    finalAnswer = typeof answer === 'string' ? answer : '';
  } else if (settingsType === 'TF') {
    finalOptions = ['True', 'False'];
    const idx = parseInt(answer, 10);
    finalAnswer = isNaN(idx) ? 0 : Math.min(idx, 1);
  } else {
    // MCQ or MULTI — answer is a numeric index from the backend
    const idx = parseInt(answer, 10);
    finalAnswer = isNaN(idx) ? 0 : idx;
  }

  return {
    id: question_id,
    type: settingsType,
    format: 'TEXT',
    text: question_text || 'Question unavailable',
    options: finalOptions,
    answer: finalAnswer,
  };
}
