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

export function useUserAnalytics(
  userId = 'default_user',
  subjectId = 'default_subject',
  filters = {},
) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      user_id: userId,
      subject_id: subjectId,
      range: filters.range ?? '30d',
      rolling_window: String(filters.rollingWindow ?? 10),
      min_attempts: String(filters.minAttempts ?? 3),
      limit: String(filters.limit ?? 10),
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

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const dashboard = await fetch(`${API_BASE}/analytics/dashboard?${params.toString()}`)
          .then(safeJson);

        if (cancelled) return;
        setData(dashboard);
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
  }, [
    userId,
    subjectId,
    filters.range,
    filters.rollingWindow,
    filters.minAttempts,
    filters.limit,
    filters.questionType,
    filters.difficulty,
    filters.topicType,
    filters.fileId,
  ]);

  return { data, loading, error };
}
