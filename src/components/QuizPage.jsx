import React, { useState, useEffect, useRef } from 'react';
import '../styles/QuizPage.css';
import { gradeQuiz, QUIZ_RESULTS_KEY } from '../utils/quizData';

const TYPE_LABELS = {
  MCQ: 'Multiple Choice',
  TF: 'True / False',
  MULTI: 'Multiple Answers',
  TEXT: 'Short Answer',
};

const HINTS = {
  MCQ: 'Select one answer',
  TF: 'True or False?',
  MULTI: 'Select all that apply',
  TEXT: 'Type your answer',
};

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(secs) {
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export default function QuizPage({ quizMeta, settings, questions, onExit }) {
  const [current, setCurrent] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [quizResults, setQuizResults] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(
    settings.timeLimitOn ? settings.timeLimitMins * 60 : null
  );

  const panelRef = useRef(null);
  // Keep a ref to userAnswers so the timer auto-submit gets the latest value
  const userAnswersRef = useRef(userAnswers);
  userAnswersRef.current = userAnswers;

  // Refs for saving results from beforeunload (avoids stale closures)
  const submittedRef = useRef(submitted);
  submittedRef.current = submitted;
  const quizResultsRef = useRef(quizResults);
  quizResultsRef.current = quizResults;

  /* ── Save results to localStorage ── */
  const saveResults = () => {
    const r = submittedRef.current
      ? quizResultsRef.current
      : gradeQuiz(userAnswersRef.current, questions);
    try {
      localStorage.setItem(QUIZ_RESULTS_KEY, JSON.stringify({ results: r, quizMeta }));
    } catch (_) {}
  };

  /* ── Save on any close (tab X or OS close) ── */
  useEffect(() => {
    window.addEventListener('beforeunload', saveResults);
    return () => window.removeEventListener('beforeunload', saveResults);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Exit: save first, then close ── */
  const handleExit = () => {
    saveResults();
    onExit();
  };

  const q = questions[current];
  const total = questions.length;
  const answered = Object.keys(userAnswers).length;
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  const isLast = current === total - 1;

  /* ── Timer countdown ── */
  useEffect(() => {
    if (!settings.timeLimitOn || submitted) return;
    const id = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [submitted, settings.timeLimitOn]);

  /* ── Auto-submit when time runs out ── */
  useEffect(() => {
    if (settings.timeLimitOn && secondsLeft === 0 && !submitted) {
      const results = gradeQuiz(userAnswersRef.current, questions);
      setSubmitted(true);
      setQuizResults(results);
      setShowResults(true);
    }
  }, [secondsLeft]);

  /* ── KaTeX + highlight.js after each render ── */
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(el, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true },
          ],
          throwOnError: false,
        });
      } catch (_) {}
    }
    el.querySelectorAll('pre code:not(.hljs)').forEach(block => {
      window.hljs?.highlightElement(block);
    });
  }, [current, submitted, userAnswers]);

  /* ── Keyboard navigation ── */
  useEffect(() => {
    const onKey = e => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') navigate(1);
      if (e.key === 'ArrowLeft') navigate(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, total]);

  /* ── Helpers ── */
  const setAnswer = (id, value) =>
    setUserAnswers(prev => ({ ...prev, [id]: value }));

  const navigate = dir => {
    const next = current + dir;
    if (next < 0 || next >= total) return;
    setCurrent(next);
    setTimeout(() => panelRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  };

  const jumpTo = idx => {
    setCurrent(idx);
    setTimeout(() => panelRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  };

  const handleSubmit = (autoSubmit = false) => {
    if (submitted) return;
    if (!autoSubmit) {
      const unanswered = total - Object.keys(userAnswers).length;
      if (unanswered > 0) {
        if (!window.confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) return;
      }
    }
    const results = gradeQuiz(userAnswers, questions);
    setSubmitted(true);
    setQuizResults(results);
    setShowResults(true);
  };

  const handleRetry = () => {
    setUserAnswers({});
    setCurrent(0);
    setSubmitted(false);
    setQuizResults(null);
    setShowResults(false);
    if (settings.timeLimitOn) setSecondsLeft(settings.timeLimitMins * 60);
    panelRef.current?.scrollTo({ top: 0 });
  };

  /* ── Timer chip class ── */
  const timerClass = secondsLeft !== null
    ? secondsLeft <= 60 ? 'danger' : secondsLeft <= 180 ? 'warning' : ''
    : '';

  /* ── Dot nav button class ── */
  const getDotClass = (dotQ, idx) => {
    const cls = [];
    if (idx === current) cls.push('active');
    if (submitted && quizResults?.results?.[dotQ.id]) {
      cls.push(quizResults.results[dotQ.id].correct ? 'correct-dot' : 'wrong-dot');
    } else if (userAnswers[dotQ.id] !== undefined) {
      cls.push('answered');
    }
    return cls.join(' ');
  };

  /* ── Answer area renderers ── */
  const renderAnswerArea = q => {
    const ua = userAnswers[q.id];

    if (q.type === 'MCQ' || q.type === 'TF') {
      return (
        <div className="qp-options">
          {q.options.map((opt, idx) => {
            let cls = 'qp-opt';
            if (submitted) {
              if (idx === q.answer) cls += ' correct';
              else if (idx === ua) cls += ' wrong';
            } else if (idx === ua) cls += ' selected';
            return (
              <button
                key={idx}
                className={cls}
                disabled={submitted}
                onClick={() => !submitted && setAnswer(q.id, idx)}
              >
                <span className="qp-opt-letter">{'ABCDE'[idx]}</span>
                <span
                  className="qp-opt-text"
                  dangerouslySetInnerHTML={{ __html: esc(opt) }}
                />
              </button>
            );
          })}
        </div>
      );
    }

    if (q.type === 'MULTI') {
      const sel = Array.isArray(ua) ? ua : [];
      const cor = Array.isArray(q.answer) ? q.answer : [q.answer];
      return (
        <div className="qp-options">
          {q.options.map((opt, idx) => {
            let cls = 'qp-opt';
            if (submitted) {
              if (cor.includes(idx)) cls += ' correct';
              else if (sel.includes(idx)) cls += ' wrong';
            } else if (sel.includes(idx)) cls += ' selected';
            return (
              <button
                key={idx}
                className={cls}
                disabled={submitted}
                onClick={() => {
                  if (submitted) return;
                  const cur = Array.isArray(userAnswers[q.id]) ? [...userAnswers[q.id]] : [];
                  const i = cur.indexOf(idx);
                  i >= 0 ? cur.splice(i, 1) : cur.push(idx);
                  setAnswer(q.id, [...cur]);
                }}
              >
                <span className="qp-opt-check">
                  {(sel.includes(idx) || (submitted && cor.includes(idx))) ? '✓' : ''}
                </span>
                <span
                  className="qp-opt-text"
                  dangerouslySetInnerHTML={{ __html: esc(opt) }}
                />
              </button>
            );
          })}
        </div>
      );
    }

    /* TEXT — short answer */
    const uaText = typeof ua === 'string' ? ua : '';
    return (
      <div className="qp-text-wrap">
        <div className="qp-text-label">Your answer</div>
        <textarea
          className="qp-text-input"
          value={uaText}
          disabled={submitted}
          placeholder="Type your answer here…"
          rows={4}
          onChange={e => !submitted && setAnswer(q.id, e.target.value)}
        />
        {submitted && (
          <div className="qp-model-answer">
            <div className="qp-model-answer-title">Model Answer</div>
            <div className="qp-model-answer-text">{q.answer}</div>
            {quizResults?.results?.[q.id] && (
              <span className={`qp-score-chip ${quizResults.results[q.id].correct ? 'good' : 'bad'}`}>
                {quizResults.results[q.id].correct ? 'Correct' : 'Incorrect'}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  /* ── Render ── */
  return (
    <div className="qp-page">

      {/* ── Header ── */}
      <header className="qp-header">
        <div className="qp-header-left">
          <div className="qp-logo">MD<span>Quiz</span></div>
          <div className="qp-header-divider" />
          <div className="qp-header-title">{quizMeta.title}</div>
        </div>
        <div className="qp-header-right">
          {settings.timeLimitOn && secondsLeft !== null && (
            <div className={`qp-timer-chip${timerClass ? ` ${timerClass}` : ''}`}>
              ⏱ <span>{formatTime(secondsLeft)}</span>
            </div>
          )}
          <span className="qp-meta-tag">
            {total} q · {settings.difficulty}
          </span>
          <button className="qp-back-btn" onClick={handleExit}>← Back</button>
        </div>
      </header>

      {/* ── Progress ── */}
      <div className="qp-progress-wrap">
        <div className="qp-prog-row">
          <span>Question {current + 1} of {total}</span>
          <b>{pct}%</b>
        </div>
        <div className="qp-prog-track">
          <div className="qp-prog-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* ── Body ── */}
      <div className="qp-body">

        {/* Question panel */}
        <div className="qp-panel" ref={panelRef}>
          <div className="qp-card">

            {/* Card meta */}
            <div className="qp-card-meta">
              <span className={`qp-type-badge qp-type-${q.type.toLowerCase()}`}>
                {TYPE_LABELS[q.type]}
              </span>
              {q.isRevisit && (
                <span className="qp-type-badge qp-type-revisit">↩ Revisit</span>
              )}
              <span className="qp-q-counter">Q{current + 1} / {total}</span>
            </div>

            {/* Question text */}
            <div
              className="qp-q-text"
              dangerouslySetInnerHTML={{ __html: esc(q.text) }}
            />

            {/* Code snippet */}
            {q.code_snippet && (
              <div className="qp-code-wrap">
                <pre><code className="language-python">{q.code_snippet}</code></pre>
              </div>
            )}

            {/* Reference tag */}
            {q.reference && (
              <div className="qp-reference">↗ {q.reference}</div>
            )}

            {/* Answer area */}
            {renderAnswerArea(q)}

          </div>
        </div>

        {/* Nav sidebar */}
        <aside className="qp-sidebar">
          {submitted && quizResults && (
            <div className="qp-score-box">
              <div className="qp-score-num">{quizResults.score_pct}%</div>
              <div className="qp-score-label">Score</div>
            </div>
          )}
          <div className="qp-sidebar-title">Questions</div>
          <div className="qp-dot-list">
            {questions.map((dq, i) => (
              <button
                key={dq.id}
                className={`qp-dot-btn ${getDotClass(dq, i)}`}
                onClick={() => jumpTo(i)}
              >
                <span className="qp-dot-status" />
                Question {i + 1}
              </button>
            ))}
          </div>
        </aside>

      </div>

      {/* ── Footer ── */}
      <footer className="qp-footer">
        <div className="qp-footer-btns">
          <button
            className="qp-btn qp-btn-ghost"
            disabled={current === 0}
            onClick={() => navigate(-1)}
          >
            ← Prev
          </button>
          {!isLast && (
            <button className="qp-btn qp-btn-primary" onClick={() => navigate(1)}>
              Next →
            </button>
          )}
          {isLast && !submitted && (
            <button className="qp-btn qp-btn-success" onClick={() => handleSubmit(false)}>
              Submit ✓
            </button>
          )}
          {submitted && (
            <button className="qp-btn qp-btn-primary" onClick={() => setShowResults(true)}>
              View Results
            </button>
          )}
        </div>
        <span className="qp-footer-hint">
          {submitted ? 'Quiz submitted — review your answers above' : (HINTS[q.type] || '')}
        </span>
      </footer>

      {/* ── Results overlay ── */}
      {showResults && quizResults && (
        <div className="qp-results-overlay">
          <div className="qp-results-card">
            <div className="qp-results-score">{quizResults.score_pct}%</div>
            <div className="qp-results-label">Overall Score</div>
            <div className="qp-results-stats">
              <div className="qp-stat">
                <div className="qp-stat-num correct">{quizResults.correct}</div>
                <div className="qp-stat-label">Correct</div>
              </div>
              <div className="qp-stat">
                <div className="qp-stat-num wrong">{quizResults.total - quizResults.correct}</div>
                <div className="qp-stat-label">Wrong</div>
              </div>
              <div className="qp-stat">
                <div className="qp-stat-num">{quizResults.total}</div>
                <div className="qp-stat-label">Total</div>
              </div>
            </div>
            <div className="qp-results-actions">
              <button
                className="qp-btn qp-btn-ghost"
                onClick={() => setShowResults(false)}
              >
                Review Answers
              </button>
              <button className="qp-btn qp-btn-primary" onClick={handleRetry}>
                ↩ Retry
              </button>
              <button className="qp-btn qp-btn-ghost" onClick={handleExit}>
                ← Settings
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
