import React from 'react';
import '../styles/QuizResults.css';

export default function QuizResults({ results, quizMeta, onRetake }) {
  if (!results) return null;

  const { score_pct, correct, total } = results;

  const scoreColor =
    score_pct >= 80 ? 'great' :
    score_pct >= 60 ? 'ok' : 'low';

  return (
    <div className="qr-page">

      {/* Header */}
      <div className="qr-header">
        <div className="qr-title">Quiz Complete</div>
        <div className="qr-subtitle">{quizMeta?.title ?? 'Session'}</div>
      </div>

      {/* Score */}
      <div className="qr-score-wrap">
        <div className={`qr-score ${scoreColor}`}>{score_pct}%</div>
        <div className="qr-score-label">Overall Score</div>
        {quizMeta?.difficulty && (
          <span className="qr-badge">{quizMeta.difficulty}</span>
        )}
      </div>

      {/* Stats */}
      <div className="qr-stats">
        <div className="qr-stat">
          <div className="qr-stat-num correct">{correct}</div>
          <div className="qr-stat-label">Correct</div>
        </div>
        <div className="qr-stat-divider" />
        <div className="qr-stat">
          <div className="qr-stat-num wrong">{total - correct}</div>
          <div className="qr-stat-label">Incorrect</div>
        </div>
        <div className="qr-stat-divider" />
        <div className="qr-stat">
          <div className="qr-stat-num">{total}</div>
          <div className="qr-stat-label">Total</div>
        </div>
      </div>

      {/* Message */}
      <div className="qr-message">
        {score_pct >= 80
          ? 'Great work! You have a solid understanding of the material.'
          : score_pct >= 60
          ? 'Good effort. Review the questions you missed and try again.'
          : 'Keep studying and give it another go — you\'ll improve!'}
      </div>

      {/* Actions */}
      <div className="qr-actions">
        <button className="qr-btn-primary" onClick={onRetake}>
          Configure New Quiz
        </button>
      </div>

    </div>
  );
}
