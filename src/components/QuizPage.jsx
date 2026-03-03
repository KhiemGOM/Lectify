import React, { useState, useEffect, useRef } from 'react';
import '../styles/QuizPage.css';
import { QUIZ_RESULTS_KEY } from '../utils/quizData';
import { gradeAnswer, API_BASE } from '../utils/api';

import Editor from "react-simple-code-editor";
import { highlight, languages } from "prismjs";

// Optional: import Prism CSS for default styling
import "prismjs/themes/prism.css";

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

function openSlideViewer(question, userId = 'default_user', subjectId = 'default_subject') {
  const { fileId, slideNums, slideText, reference } = question;

  // If the original file is available, embed it in an iframe
  if (fileId) {
    const targetPage = slideNums?.length > 0
      ? Math.min(...slideNums.map(Number).filter(n => !isNaN(n)))
      : 1;

    const fileUrl = `${API_BASE}/slides/${encodeURIComponent(fileId)}/file`
      + `?user_id=${encodeURIComponent(userId)}&subject_id=${encodeURIComponent(subjectId)}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${reference ?? 'Slide Viewer'}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;display:flex;flex-direction:column;height:100vh}
    header{background:#1d4ed8;color:#fff;padding:10px 20px;font-size:13px;font-weight:600;flex-shrink:0;display:flex;align-items:center;gap:10px}
    .badge{background:rgba(255,255,255,.2);border-radius:6px;padding:2px 10px;font-size:12px}
    iframe{flex:1;border:none;width:100%;display:block}
    .fallback{color:#94a3b8;text-align:center;padding:40px 20px;font-size:14px}
    .fallback a{color:#60a5fa}
  </style>
</head>
<body>
  <header>
    <span>&#128204; ${reference ?? 'Slide Reference'}</span>
    <span class="badge">Page ${targetPage}</span>
  </header>
  <iframe
    id="pdfFrame"
    src="${fileUrl}#page=${targetPage}"
    title="${reference ?? 'Slide Reference'}"
  ></iframe>
  <script>
    const frame = document.getElementById('pdfFrame');
    frame.onerror = function() {
      frame.style.display = 'none';
      const d = document.createElement('div');
      d.className = 'fallback';
      d.innerHTML = '<p>Could not embed file. <a href="${fileUrl}" target="_blank">Open file directly</a></p>';
      document.body.appendChild(d);
    };
  </script>
</body>
</html>`;

    const win = window.open(
      '',
      '_blank',
      'width=960,height=780,left=80,top=60,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes',
    );
    if (win) {
      win.document.write(html);
      win.document.close();
    }
    return;
  }

  // Fallback: render extracted text when no file is stored on disk
  if (!slideText) return;

  const targetSlide = slideNums?.length > 0
    ? Math.min(...slideNums.map(Number).filter(n => !isNaN(n)))
    : null;

  // Parse "Slide N:\ncontent" blocks from raw_text
  const sections = [];
  const regex = /^Slide (\d+):\n([\s\S]*?)(?=^Slide \d+:|$(?![\s\S]))/gm;
  let match;
  const paddedText = slideText + '\nSlide 999999:\n';
  while ((match = regex.exec(paddedText)) !== null) {
    const num = parseInt(match[1], 10);
    if (num !== 999999) sections.push({ num, content: match[2].trim() });
  }

  const slidesHtml = sections.length > 0
    ? sections.map(sec => {
        const isTarget = slideNums?.includes(sec.num);
        return `<section id="slide-${sec.num}"${isTarget ? ' class="highlighted"' : ''}>
          <h3>Slide ${sec.num}</h3>
          <p>${esc(sec.content)}</p>
        </section>`;
      }).join('\n')
    : `<section><pre>${esc(slideText)}</pre></section>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${reference ?? 'Slide Viewer'}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;color:#1e293b}
    header{background:#1d4ed8;color:#fff;padding:14px 24px;font-size:14px;font-weight:600;position:sticky;top:0;z-index:10}
    .slides{max-width:800px;margin:24px auto;padding:0 24px 60px;display:flex;flex-direction:column;gap:14px}
    section{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px}
    section.highlighted{border-color:#1d4ed8;box-shadow:0 0 0 3px rgba(29,78,216,.15)}
    h3{font-size:11px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px}
    p{line-height:1.75;font-size:14px;white-space:pre-wrap;color:#334155}
    pre{font-family:inherit;white-space:pre-wrap;line-height:1.75;font-size:14px}
  </style>
</head>
<body>
  <header>↗ ${reference ?? 'Slide Reference'}</header>
  <div class="slides">${slidesHtml}</div>
  <script>
    const el = document.getElementById('slide-${targetSlide}');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  </script>
</body>
</html>`;

  const win = window.open(
    '',
    '_blank',
    'width=860,height=700,left=100,top=80,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes',
  );
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

/* ── MathQuill input field for math answers ── */
function MathQuillInput({ value, disabled, onChange }) {
  const containerRef = useRef(null);
  const mqRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !window.MathQuill) return;
    const MQ = window.MathQuill.getInterface(2);
    const mq = MQ.MathField(el, {
      handlers: {
        edit: () => onChange(mq.latex()),
      },
    });
    if (value) mq.latex(value);
    mqRef.current = mq;
    return () => {
      mqRef.current = null;
      el.innerHTML = '';
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span
      ref={containerRef}
      className={`qp-mathquill-field${disabled ? ' qp-mathquill-disabled' : ''}`}
    />
  );
}

export default function QuizPage({ quizMeta, settings, questions, onExit, userId = 'default_user', subjectId = 'default_subject' }) {
  const [current, setCurrent] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [quizResults, setQuizResults] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
    console.log('[QuizPage] saveResults called — submitted:', submittedRef.current, 'hasResults:', !!quizResultsRef.current);
    if (!submittedRef.current || !quizResultsRef.current) return;
    try {
      localStorage.setItem(QUIZ_RESULTS_KEY, JSON.stringify({ results: quizResultsRef.current, quizMeta }));
      console.log('[QuizPage] wrote results to localStorage');
    } catch (_) {}
  };

  /* ── Save on any close (tab X or OS close) ── */
  useEffect(() => {
    console.log('[QuizPage] mounted — questions:', questions?.length, 'userId:', userId, 'subjectId:', subjectId);
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
      void handleSubmit(true);
    }
  }, [secondsLeft]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const gradeWithBackend = async () => {
    
    const pointsPerQuestion = questions.length > 0 ? 100 / questions.length : 0;
    const gradedEntries = await Promise.all(
      questions.map(async (question) => {
        const rawUserAnswer = userAnswersRef.current[question.id];
        let userAnswer;

        if (question.type === 'TEXT') {
          userAnswer = String(rawUserAnswer ?? '');
        } else if (question.type === 'MULTI') {
          userAnswer = Array.isArray(rawUserAnswer)
            ? rawUserAnswer.join(',')
            : String(rawUserAnswer ?? '');
        } else {
          userAnswer = String(rawUserAnswer ?? '');
        }

        try {
          const result = await gradeAnswer(
            question.id,
            userAnswer,
            question.type,
            null,
            userId,
            subjectId,
          );
          const score = Number(result?.score ?? 0);
          const scaledScore = (score / 10) * pointsPerQuestion;

          return [question.id, { correct: score >= 10, score: scaledScore }];
        } catch (_) {
          return [question.id, { correct: false, score: 0 }];
        }
      })
    );

    const results = Object.fromEntries(gradedEntries);
    const total = questions.length;
    const totalScore = questions.reduce((sum, question) => sum + (results[question.id]?.score || 0), 0);

    const correct = questions.filter((question) => results[question.id]?.correct).length;
    const score_pct = Math.round(totalScore * 10) / 10;

    return { score_pct, correct, total, results };
  };

  const handleSubmit = async (autoSubmit = false) => {
    if (submitted || submitting) return;
    if (!autoSubmit) {
      const unanswered = total - Object.keys(userAnswers).length;
      if (unanswered > 0) {
        if (!window.confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) return;
      }
    }
    setSubmitting(true);
    const results = await gradeWithBackend();
    setSubmitted(true);
    setQuizResults(results);
    setShowResults(true);
    setSubmitting(false);
  };

  const handleRetry = () => {
    setUserAnswers({});
    setCurrent(0);
    setSubmitted(false);
    setSubmitting(false);
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
      const sel = Array.isArray(ua) ? ua : (ua ? String(ua).split('').map(Number) : []);
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

                      const current = userAnswers[q.id] || "";

                      // Convert string like "013" → [0,1,3]
                      const cur = current
                          ? current.split("").map(Number)
                          : [];

                      const i = cur.indexOf(idx);

                      if (i >= 0) {
                        cur.splice(i, 1);
                      } else {
                        cur.push(idx);
                      }

                      // Always sort so order is consistent
                      cur.sort((a, b) => a - b);

                      // Join WITHOUT commas
                      setAnswer(q.id, cur.join(""));
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
    //  add mathquill support latex if needed
    const uaText = typeof ua === 'string' ? ua : '';
    return (
        <div className="qp-text-wrap">
          <div className="qp-text-label">Your answer</div>

          {q.metadata?.["FORMAT"] === "TEXT" && (
              <input
                  type="text"
                  value={uaText}
                  disabled={submitted}
                  onChange={e => setAnswer(q.id, e.target.value)}
                  className="qp-text-input"
                  style={{
                    height: '1.5em',       // roughly one line of text
                    padding: '2px 4px',    // reduce vertical padding
                    fontSize: '14px',      // adjust if needed
                    lineHeight: '1.5',     // ensures text is centered
                    boxSizing: 'border-box'
                  }}
              />
          )}

          {q.metadata?.["FORMAT"] === "LATEX" && (
              <MathQuillInput
                  key={q.id}
                  value={uaText}
                  disabled={submitted}
                  onChange={val => setAnswer(q.id, val)}
              />
          )}

          {q.metadata?.["FORMAT"] === "CODE" && (
              <Editor
                  value={uaText}
                  onValueChange={val => setAnswer(q.id, val)}
                  highlight={code => highlight(code, languages.js, "js")} // optional, can be code => code
                  padding={10}
                  style={{
                    fontFamily: '"Fira code", monospace',
                    fontSize: 14,
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    minHeight: '120px',
                  }}
              />
          )}

          {/* Fallback to text input */}
          {!["TEXT", "LATEX", "CODE"].includes(q.metadata?.["FORMAT"]) && (
              <input
                  type="text"
                  value={uaText}
                  disabled={submitted}
                  onChange={e => setAnswer(q.id, e.target.value)}
                  className="qp-text-input"
                  style={{
                    height: '1.5em',       // roughly one line of text
                    padding: '2px 4px',    // reduce vertical padding
                    fontSize: '14px',      // adjust if needed
                    lineHeight: '1.5',     // ensures text is centered
                    boxSizing: 'border-box'
                  }}
              />
          )}

          {submitted && (
              <div className="qp-model-answer">
                <div className="qp-model-answer-title">Model Answer</div>
                <div className="qp-model-answer-text">{q.answer}</div>
                {quizResults?.results?.[q.id] && (
                    <span
                        className={`qp-score-chip ${
                            quizResults.results[q.id].correct ? 'good' : 'bad'
                        }`}
                    >
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

            {/* Reference tag — only visible after submission */}
            {submitted && q.reference && (
              <button
                className="qp-reference"
                onClick={() => openSlideViewer(q, userId, subjectId)}
                title="View source slides"
              >
                ↗ {q.reference}
              </button>
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
            <button className="qp-btn qp-btn-success" onClick={() => void handleSubmit(false)} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit ✓'}
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
