import React, { useState } from "react";
import "../styles/QuizSettings.css";
import { getAllMockQuestions, buildQuestions, QUIZ_STORAGE_KEY, QUIZ_RESULTS_KEY } from "../utils/quizData";
import { generateQuestion, mapApiQuestion } from "../utils/api";

export default function QuizSettings({ session }) {
  const [numQuestions, setNumQuestions] = useState(10);
  const [difficulty, setDifficulty] = useState("Mixed");
  const [types, setTypes] = useState(["MCQ", "TF", "MULTI", "TEXT"]);
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timeMins, setTimeMins] = useState(15);
  const [generating, setGenerating] = useState(false);

  const stepNum = (delta) => {
    setNumQuestions((prev) => Math.max(1, Math.min(180, prev + delta)));
  };

  const toggleType = (type) => {
    setTypes((prev) =>
      prev.includes(type)
        ? prev.filter((t) => t !== type)
        : [...prev, type]
    );
  };

  const launchQuiz = async () => {
    if (generating) return;
    setGenerating(true);

    const settings = {
      numQuestions,
      difficulty,
      types,
      timeLimitOn: timerEnabled,
      timeLimitMins: timeMins,
    };

    const quizMeta = {
      id: session?.id ?? "session",
      title: session?.name ?? "Quiz",
      subject: "Uploaded Session",
      numQuestions,
      difficulty,
    };

    let questions;
    const sessionFiles = session?.files;

    if (sessionFiles && sessionFiles.length > 0) {
      // Generate questions from uploaded slides via API
      const validTypes = types.length > 0 ? types : ["MCQ"];
      // Backend supports "MCQ" and "TEXT" format types
      const toApiFormat = (t) => (t === "TEXT" ? "TEXT" : "MCQ");

      const promises = Array.from({ length: numQuestions }, (_, i) => {
        const fileObj = sessionFiles[i % sessionFiles.length];
        const settingsType = validTypes[i % validTypes.length];
        const apiFormat = toApiFormat(settingsType);
        // Cycle through available chunks for this file and pass chunk payload expected by backend.
        const chunk = fileObj.chunks.length > 0 ? fileObj.chunks[i % fileObj.chunks.length] : null;
        return generateQuestion(fileObj.fileId, chunk, "Theory", apiFormat)
          .then((res) => mapApiQuestion(res, settingsType))
          .catch((err) => {
            console.error("Question generation failed:", err);
            return null;
          });
      });

      const resolved = await Promise.all(promises);
      questions = resolved.filter(Boolean);
    } else {
      // Fallback to mock data when no uploaded slides are present
      questions = buildQuestions(getAllMockQuestions(), settings);
    }

    sessionStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify({ quizMeta, settings, questions }));

    const features = [
      "width=1280", "height=860",
      "left=80", "top=60",
      "menubar=no", "toolbar=no", "location=no",
      "status=no", "resizable=yes", "scrollbars=yes",
    ].join(",");

    localStorage.removeItem(QUIZ_RESULTS_KEY);
    window.open("/?mode=quiz", "quizWindow", features);
    setGenerating(false);
  };

  const summaryText = `${numQuestions} questions · ${difficulty} · ${
    types.length > 0 ? types.join(", ") : "No types selected"
  }${timerEnabled ? ` · ${timeMins} min` : ""}`;

  return (
    <div className="qs-page">

      {/* Page header */}
      <div className="qs-header">
        <div className="qs-title">Quiz Settings</div>
        <div className="qs-subtitle">Configure your quiz before you start</div>
      </div>

      {/* Questions */}
      <div className="qs-section">
        <div className="qs-section-label">Questions</div>
        <div className="qs-row">
          <div className="qs-label-wrap">
            <div className="qs-label">Number of questions</div>
            <div className="qs-desc">How many questions to include</div>
          </div>
          <div className="qs-stepper">
            <button className="qs-stepper-btn" onClick={() => stepNum(-1)}>−</button>
            <span className="qs-stepper-val">{numQuestions}</span>
            <button className="qs-stepper-btn" onClick={() => stepNum(1)}>+</button>
          </div>
        </div>
      </div>

      {/* Difficulty */}
      <div className="qs-section">
        <div className="qs-section-label">Difficulty</div>
        <div className="qs-row">
          <div className="qs-label-wrap">
            <div className="qs-label">Level</div>
            <div className="qs-desc">Controls question complexity</div>
          </div>
          <div className="qs-seg">
            {["Easy", "Medium", "Hard", "Mixed"].map((level) => (
              <button
                key={level}
                className={`qs-seg-btn${difficulty === level ? " active" : ""}`}
                onClick={() => setDifficulty(level)}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Question Types */}
      <div className="qs-section">
        <div className="qs-section-label">Question types</div>
        <div className="qs-row">
          <div className="qs-label-wrap">
            <div className="qs-label">Include types</div>
            <div className="qs-desc">Select at least one type</div>
          </div>
          <div className="qs-chips">
            {[
              { label: "MCQ", value: "MCQ" },
              { label: "True/False", value: "TF" },
              { label: "Multi", value: "MULTI" },
              { label: "Short Answer", value: "TEXT" },
            ].map((type) => (
              <button
                key={type.value}
                className={`qs-chip${types.includes(type.value) ? " active" : ""}`}
                onClick={() => toggleType(type.value)}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Time Limit */}
      <div className="qs-section">
        <div className="qs-section-label">Time limit</div>
        <div className="qs-row">
          <div className="qs-label-wrap">
            <div className="qs-label">Enable timer</div>
            <div className="qs-desc">Auto-submit when time runs out</div>
          </div>
          <div className="qs-toggle-wrap">
            <label className="qs-toggle">
              <input
                type="checkbox"
                checked={timerEnabled}
                onChange={(e) => setTimerEnabled(e.target.checked)}
              />
              <span className="qs-toggle-track"></span>
              <span className="qs-toggle-thumb"></span>
            </label>
          </div>
        </div>
        {timerEnabled && (
          <div className="qs-row">
            <div className="qs-label-wrap">
              <div className="qs-label">Duration</div>
            </div>
            <div className="qs-time-wrap">
              <input
                className="qs-time-input"
                type="number"
                value={timeMins}
                min="1"
                max="180"
                onChange={(e) => setTimeMins(Number(e.target.value))}
              />
              <span className="qs-time-label">minutes</span>
            </div>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="qs-summary">
        <span className="qs-summary-icon">📋</span>
        <span className="qs-summary-text">{summaryText}</span>
      </div>

      {/* Footer */}
      <div className="qs-footer">
        <button className="qs-btn-start" onClick={launchQuiz} disabled={generating}>
          {generating ? "Generating questions…" : "Start Quiz →"}
        </button>
      </div>

    </div>
  );
}
