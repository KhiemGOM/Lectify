import { useEffect, useState } from 'react';
import { API_BASE } from '../utils/api';

function safeJson(res) {
  if (!res.ok) {
    return res.text().then((text) => {
      throw new Error(text || `HTTP ${res.status}`);
    });
  }
  return res.json();
}

function toFileModel(file) {
  return {
    id: file.file_id,
    name: file.filename,
  };
}

function toQuizModel(question) {
  const title = (question.question_text || '').slice(0, 80) || 'Quiz Question';
  return {
    id: question.question_id,
    title,
    sourceFileId: question.file_id || '',
  };
}

function toAttemptModel(attempt) {
  return {
    id: attempt.attempt_id,
    quizId: attempt.question_id,
    sourceFileId: attempt.file_id || '',
    scorePercent: Number(attempt.score || 0) * 10,
    timeTakenSeconds: 0,
    attemptedAt: attempt.attempted_at,
  };
}

export function useUserAnalytics(userId = 'default_user', subjectId = 'default_subject') {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const qs = `?user_id=${encodeURIComponent(userId)}&subject_id=${encodeURIComponent(subjectId)}`;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [filesRes, questionsRes, attemptsRes] = await Promise.all([
          fetch(`${API_BASE}/slides${qs}`).then(safeJson),
          fetch(`${API_BASE}/questions${qs}`).then(safeJson),
          fetch(`${API_BASE}/attempts${qs}`).then(safeJson),
        ]);

        if (cancelled) return;
        setData({
          userId,
          files: Array.isArray(filesRes) ? filesRes.map(toFileModel) : [],
          quizzes: Array.isArray(questionsRes) ? questionsRes.map(toQuizModel) : [],
          attempts: Array.isArray(attemptsRes) ? attemptsRes.map(toAttemptModel) : [],
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [userId, subjectId]);

  return { data, loading, error };
}
