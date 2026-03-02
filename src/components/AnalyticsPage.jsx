import { useMemo, useState } from "react";
import "../styles/Analytics.css";

import { useUserAnalytics } from "../hooks/useUserAnalytics";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";

import {
  computeSummary,
  filterByDateRange,
  formatShortDateLabel,
  formatTableDate,
  groupByFilePerformance,
  makeIdMap,
  secondsToMMSS,
} from "../utils/analytics";

function percent(n) {
  return `${Math.round(n)}%`;
}

export default function AnalyticsPage() {
  const { data, loading, error } = useUserAnalytics();

  const [dateRange, setDateRange] = useState("7d");
  const [fileId, setFileId] = useState("all");

  const files    = data?.files    || [];
  const quizzes  = data?.quizzes  || [];
  const attempts = data?.attempts || [];

  const filesById   = useMemo(() => makeIdMap(files),   [files]);
  const quizzesById = useMemo(() => makeIdMap(quizzes), [quizzes]);

  const filteredAttempts = useMemo(() => {
    const byDate = filterByDateRange(attempts, dateRange);
    if (fileId === "all") return byDate;
    return byDate.filter((a) => a.sourceFileId === fileId);
  }, [attempts, dateRange, fileId]);

  const summary = useMemo(() => computeSummary(filteredAttempts), [filteredAttempts]);

  const scoreOverTime = useMemo(() => {
    return filteredAttempts
      .slice()
      .sort((a, b) => +new Date(a.attemptedAt) - +new Date(b.attemptedAt))
      .map((a) => ({
        attemptedAtLabel: formatShortDateLabel(a.attemptedAt),
        scorePercent: a.scorePercent,
      }));
  }, [filteredAttempts]);

  const perfByFile = useMemo(
    () => groupByFilePerformance(filteredAttempts, filesById),
    [filteredAttempts, filesById]
  );

  const attemptsByQuiz = useMemo(() => {
    const map = new Map();
    for (const a of filteredAttempts) {
      const title    = quizzesById[a.quizId]?.title || "Quiz";
      const existing = map.get(a.quizId) || { quizTitle: title, attempts: 0 };
      existing.attempts += 1;
      map.set(a.quizId, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.attempts - a.attempts);
  }, [filteredAttempts, quizzesById]);

  const recentRows = useMemo(() => {
    return filteredAttempts
      .slice()
      .sort((a, b) => +new Date(b.attemptedAt) - +new Date(a.attemptedAt))
      .slice(0, 8);
  }, [filteredAttempts]);

  if (loading) {
    return (
      <div className="analyticsShell">
        <div className="an-stateCard">Loading analytics…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analyticsShell">
        <div className="an-stateCard">
          <div className="an-stateTitle">Couldn't load analytics</div>
          <div className="an-stateSub">{error}</div>
          <button className="an-btn" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="analyticsShell">
      {/* Top row */}
      <div className="an-topRow">
        <div className="an-pageTitleWrap">
          <h1 className="an-pageTitle">Analytics</h1>
          <div className="an-pageSub">Your personal learning progress</div>
        </div>

        <div className="an-controls">
          <div className="an-controlBlock">
            <div className="an-controlLabel">Date range</div>
            <select
              className="an-select"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
            >
              <option value="7d">7 days</option>
              <option value="30d">1 month</option>
              <option value="all">All</option>
            </select>
          </div>

          <div className="an-controlBlock">
            <div className="an-controlLabel">Source file</div>
            <select
              className="an-select"
              value={fileId}
              onChange={(e) => setFileId(e.target.value)}
            >
              <option value="all">All files</option>
              {files.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary card */}
      <section className="an-card an-summaryCard">
        <div className="an-cardHead">
          <h2 className="an-cardTitle">Summary</h2>
          <div className="an-cardHint">Overview for selected filters</div>
        </div>
        <div className="an-summaryGrid">
          <div className="an-kpi">
            <div className="an-kpiLabel">Total attempts</div>
            <div className="an-kpiValue">{summary.totalAttempts}</div>
          </div>
          <div className="an-kpi">
            <div className="an-kpiLabel">Average score</div>
            <div className="an-kpiValue">{percent(summary.avgScore)}</div>
          </div>
          <div className="an-kpi">
            <div className="an-kpiLabel">Best score</div>
            <div className="an-kpiValue">{percent(summary.bestScore)}</div>
          </div>
          <div className="an-kpi">
            <div className="an-kpiLabel">Avg time</div>
            <div className="an-kpiValue">{secondsToMMSS(summary.avgTimeSeconds)}</div>
          </div>
        </div>
      </section>

      {/* 2×2 grid */}
      <section className="an-grid2x2">
        {/* Score over time */}
        <div className="an-card">
          <div className="an-cardHead">
            <h3 className="an-cardTitle">Score over time</h3>
            <div className="an-cardHint">Are you improving?</div>
          </div>
          <div className="an-chartBox">
            <ResponsiveContainer>
              <LineChart data={scoreOverTime} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="attemptedAtLabel" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
                <Tooltip
                  contentStyle={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", fontSize: 13 }}
                  formatter={(v) => [`${Math.round(Number(v))}%`, "Score"]}
                />
                <Line
                  type="monotone"
                  dataKey="scorePercent"
                  stroke="var(--primary-blue)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--primary-blue)" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Avg score by file */}
        <div className="an-card">
          <div className="an-cardHead">
            <h3 className="an-cardTitle">Avg score by file</h3>
            <div className="an-cardHint">Strengths vs struggles</div>
          </div>
          <div className="an-chartBox">
            <ResponsiveContainer>
              <BarChart data={perfByFile} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="fileName" hide />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
                <Tooltip
                  contentStyle={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", fontSize: 13 }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fileName || ""}
                  formatter={(v) => [`${Math.round(Number(v))}%`, "Avg score"]}
                />
                <Bar dataKey="avgScorePercent" fill="var(--primary-blue)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="an-miniList">
            {perfByFile.slice(0, 4).map((x) => (
              <div className="an-miniRow" key={x.sourceFileId}>
                <div className="an-miniLeft" title={x.fileName}>{x.fileName}</div>
                <div className="an-miniRight">{Math.round(x.avgScorePercent)}% · {x.attempts}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent attempts */}
        <div className="an-card">
          <div className="an-cardHead">
            <h3 className="an-cardTitle">Recent attempts</h3>
            <div className="an-cardHint">Latest activity</div>
          </div>
          <div className="an-tableWrap">
            <table className="an-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Quiz</th>
                  <th>Score</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {recentRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="an-mutedCell">No attempts yet.</td>
                  </tr>
                ) : (
                  recentRows.map((a) => {
                    const quizTitle = quizzesById[a.quizId]?.title || "Quiz";
                    return (
                      <tr key={a.id}>
                        <td className="an-muted">{formatTableDate(a.attemptedAt)}</td>
                        <td className="an-muted">{quizTitle}</td>
                        <td className="an-strong">{Math.round(a.scorePercent)}%</td>
                        <td className="an-muted">{secondsToMMSS(a.timeTakenSeconds)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Attempts per quiz */}
        <div className="an-card">
          <div className="an-cardHead">
            <h3 className="an-cardTitle">Attempts per quiz</h3>
            <div className="an-cardHint">How often you revisit each quiz</div>
          </div>
          <div className="an-chartBox">
            <ResponsiveContainer>
              <BarChart data={attemptsByQuiz} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="quizTitle" hide />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
                <Tooltip
                  contentStyle={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", fontSize: 13 }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.quizTitle || ""}
                  formatter={(v) => [`${Number(v)}`, "Attempts"]}
                />
                <Bar dataKey="attempts" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="an-miniList">
            {attemptsByQuiz.slice(0, 4).map((x) => (
              <div className="an-miniRow" key={x.quizTitle}>
                <div className="an-miniLeft" title={x.quizTitle}>{x.quizTitle}</div>
                <div className="an-miniRight">{x.attempts} attempt{x.attempts !== 1 ? "s" : ""}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
