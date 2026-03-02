/* ── api.js — REST API client for the FastAPI backend ── */

const API_BASE = 'http://127.0.0.1:8000';

/**
 * Upload a file to the backend.
 * Returns { file_id, filename, chunks: [{chunk_id, content, summary}] }
 */
export async function uploadSlides(file, userId = 'default_user', subjectId = 'default_subject') {
  const url = `${API_BASE}/slides?user_id=${encodeURIComponent(userId)}&subject_id=${encodeURIComponent(subjectId)}`;
  const formData = new FormData();
  formData.append('file', file);

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
 * Generate a single quiz question from a stored chunk.
 * slideId    — file_id returned by POST /slides
 * chunkIndex — 0-based index into that file's chunks array
 * Returns { question_id, raw: { metadata, question_text, options, answer } }
 */
export async function generateQuestion(
  slideId,
  chunkIndex,
  topicType = 'Theory',
  formatType = 'MCQ',
  userId = 'default_user',
  subjectId = 'default_subject',
) {
  const url = `${API_BASE}/quiz/generate?user_id=${encodeURIComponent(userId)}&subject_id=${encodeURIComponent(subjectId)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slide_id: slideId,
      chunk_index: chunkIndex,
      topic_type: topicType,
      format_type: formatType,
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
 * timeStart / timeEnd — ISO-8601 strings marking when the question was shown / answered.
 * Returns { score: 0-10 }
 */
export async function gradeAnswer(
  questionId,
  userAnswer,
  questionType = 'MCQ',
  timeStart = new Date().toISOString(),
  timeEnd = new Date().toISOString(),
  userId = 'default_user',
  subjectId = 'default_subject',
) {
  const url = `${API_BASE}/quiz/answer?user_id=${encodeURIComponent(userId)}&subject_id=${encodeURIComponent(subjectId)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question_id: questionId,
      user_answer: String(userAnswer),
      time_start: timeStart,
      time_end: timeEnd,
      question_type: questionType,
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
