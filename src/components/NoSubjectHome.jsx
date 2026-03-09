import React from 'react';
import '../styles/NoSubjectHome.css';

export default function NoSubjectHome({
  hasSubjects = false,
  onStartNew,
}) {
  return (
    <div className="nsh-shell">
      <section className="nsh-hero">
        <div className="nsh-kicker">Welcome</div>
        <h2 className="nsh-title">Build Your Next Study Subject</h2>
        <p className="nsh-subtitle">
          {hasSubjects
            ? 'Create a new subject, or pick an existing one from the sidebar.'
            : 'Upload your first file to generate questions and track analytics.'}
        </p>

        <div className="nsh-actions">
          <button className="nsh-btn nsh-btn-primary" onClick={onStartNew}>
            Create New Subject
          </button>
        </div>

        <h3 className="nsh-sectionTitle">How it works</h3>
        <div className="nsh-steps">
          <div className="nsh-step"><span>1</span>Upload file(s)</div>
          <div className="nsh-step"><span>2</span>Generate quiz</div>
          <div className="nsh-step"><span>3</span>Review analytics</div>
        </div>
      </section>
    </div>
  );
}
