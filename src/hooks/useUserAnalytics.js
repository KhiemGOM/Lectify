import { useState, useEffect } from 'react';

/* ── Mock data (replace with real API calls once backend is live) ── */

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const FILES = [
  { id: 'f1', name: 'Cardiology Lecture 1.pdf' },
  { id: 'f2', name: 'Calculus Chapter 3.pdf' },
  { id: 'f3', name: 'Python Fundamentals.pdf' },
  { id: 'f4', name: 'Organic Chemistry.pdf' },
];

const QUIZZES = [
  { id: 'q1', title: 'Cardiology Quiz', sourceFileId: 'f1' },
  { id: 'q2', title: 'Calculus Quiz',   sourceFileId: 'f2' },
  { id: 'q3', title: 'Python Quiz',     sourceFileId: 'f3' },
  { id: 'q4', title: 'Chemistry Quiz',  sourceFileId: 'f4' },
];

const ATTEMPTS = [
  { id: 'a1',  quizId: 'q1', sourceFileId: 'f1', scorePercent: 62, timeTakenSeconds: 420, attemptedAt: daysAgo(1)  },
  { id: 'a2',  quizId: 'q2', sourceFileId: 'f2', scorePercent: 78, timeTakenSeconds: 380, attemptedAt: daysAgo(2)  },
  { id: 'a3',  quizId: 'q1', sourceFileId: 'f1', scorePercent: 71, timeTakenSeconds: 390, attemptedAt: daysAgo(3)  },
  { id: 'a4',  quizId: 'q3', sourceFileId: 'f3', scorePercent: 85, timeTakenSeconds: 300, attemptedAt: daysAgo(4)  },
  { id: 'a5',  quizId: 'q4', sourceFileId: 'f4', scorePercent: 55, timeTakenSeconds: 510, attemptedAt: daysAgo(5)  },
  { id: 'a6',  quizId: 'q1', sourceFileId: 'f1', scorePercent: 80, timeTakenSeconds: 350, attemptedAt: daysAgo(7)  },
  { id: 'a7',  quizId: 'q2', sourceFileId: 'f2', scorePercent: 90, timeTakenSeconds: 280, attemptedAt: daysAgo(12) },
  { id: 'a8',  quizId: 'q3', sourceFileId: 'f3', scorePercent: 72, timeTakenSeconds: 330, attemptedAt: daysAgo(15) },
  { id: 'a9',  quizId: 'q4', sourceFileId: 'f4', scorePercent: 68, timeTakenSeconds: 450, attemptedAt: daysAgo(20) },
  { id: 'a10', quizId: 'q1', sourceFileId: 'f1', scorePercent: 88, timeTakenSeconds: 310, attemptedAt: daysAgo(25) },
];

const MOCK_DATA = {
  userId: 'student01',
  files: FILES,
  quizzes: QUIZZES,
  attempts: ATTEMPTS,
};

export function useUserAnalytics() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setData(MOCK_DATA);
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  return { data, loading, error };
}
