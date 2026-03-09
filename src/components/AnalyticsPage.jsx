import {useEffect, useMemo, useRef, useState} from "react";
import "../styles/Analytics.css";
import {useUserAnalytics} from "../hooks/useUserAnalytics";
import {fetchAnalyticsHistory, fetchQuestionDetail} from "../utils/api";
import {QUIZ_STORAGE_KEY} from "../utils/quizData";
import ReactSelect from "react-select";
import {Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,} from "recharts";

function percent(v) {
    return `${Math.round(Number(v || 0))}%`;
}

function scoreDelta(v) {
    const n = Number(v || 0);
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(1)}pp`;
}

function shortDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {month: "short", day: "numeric"});
}

function longDateTime(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleString("en-US", {
        year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
}

function areaTypeLabel(type) {
    if (type === "question_type") return "Format";
    if (type === "topic") return "Scope";
    if (type === "file") return "File";
    return type || "-";
}

function areaValueLabel(type, key) {
    const raw = String(key || "");
    if (type === "question_type") {
        if (raw === "MCQ") return "MCQ";
        if (raw === "TF") return "True/False";
        if (raw === "MULTI") return "Multi";
        if (raw === "TEXT") return "Short Answer";
    }
    if (type === "topic") {
        if (raw === "Theory") return "Theory";
        if (raw === "Applied") return "Applied";
    }
    return raw || "-";
}

function questionFormatLabel(rawType) {
    const raw = String(rawType || "");
    if (raw === "MCQ") return "MCQ";
    if (raw === "TF") return "True/False";
    if (raw === "MULTI") return "Multi";
    if (raw === "TEXT") return "Short Answer";
    return raw || "-";
}

function truncateText(text, max = 38) {
    const s = String(text || "");
    if (s.length <= max) return s;
    return `${s.slice(0, max - 3)}...`;
}

function normalizeQuestion(detail) {
    const qType = detail?.format_type || "MCQ";
    const options = Array.isArray(detail?.options) ? detail.options : [];
    const rawAnswer = detail?.answer;
    let answer;

    if (qType === "TEXT") {
        answer = typeof rawAnswer === "string" ? rawAnswer : String(rawAnswer ?? "");
    } else if (qType === "MULTI") {
        const str = typeof rawAnswer === "string" ? rawAnswer : String(rawAnswer ?? "");
        answer = str.split("").map(Number).filter((n) => !Number.isNaN(n));
    } else if (qType === "TF") {
        const idx = Number.parseInt(String(rawAnswer ?? "0"), 10);
        answer = Number.isNaN(idx) ? 0 : Math.min(Math.max(idx, 0), 1);
    } else {
        const idx = Number.parseInt(String(rawAnswer ?? "0"), 10);
        answer = Number.isNaN(idx) ? 0 : idx;
    }

    return {
        id: detail?.question_id,
        type: qType,
        format: "TEXT",
        text: detail?.question_text || "Question unavailable",
        options: qType === "TF" ? ["True", "False"] : options,
        answer,
    };
}

function buildReference(detail, row) {
    const slideRef = detail?.metadata?.SLIDE;
    const fileName = row?.file_name || "Reference";

    if (Array.isArray(slideRef) && slideRef.length > 0) {
        const label = slideRef.length > 1 ? "Slides" : "Slide";
        return `${fileName} — ${label} ${slideRef.join(", ")}`;
    }
    if (slideRef !== undefined && slideRef !== null && String(slideRef).trim() !== "") {
        return `${fileName} — Slide ${slideRef}`;
    }
    return fileName || null;
}

function parseSlideNums(raw) {
    if (raw == null) return [];
    if (Array.isArray(raw)) {
        return raw
            .map((v) => Number.parseInt(String(v), 10))
            .filter((n) => Number.isFinite(n) && n > 0);
    }
    const text = String(raw).trim();
    if (!text) return [];
    const matches = text.match(/\d+/g) || [];
    return matches
        .map((v) => Number.parseInt(v, 10))
        .filter((n) => Number.isFinite(n) && n > 0);
}

function normalizeLatestAnswer(questionType, latestUserAnswer) {
    const raw = String(latestUserAnswer ?? "");
    if (questionType === "TEXT") return raw;
    if (questionType === "MULTI") return raw.replace(/\D/g, "");
    const idx = Number.parseInt(raw, 10);
    return Number.isNaN(idx) ? "" : idx;
}

function AnalyticsSelect({
                             value,
                             onValueChange,
                             options,
                             placeholder = "Select",
                             triggerClassName = "",
                             disabled = false,
                         }) {
    const selected = options.find((opt) => opt.value === value) || null;

    return (<div className={`an-reactSelectWrap ${triggerClassName}`.trim()}>
        <ReactSelect
            classNamePrefix="an-reactSelect"
            options={options}
            value={selected}
            onChange={(opt) => onValueChange(opt?.value ?? "")}
            isSearchable={false}
            menuPortalTarget={document.body}
            menuPosition="fixed"
            closeMenuOnScroll
            placeholder={placeholder}
            isClearable={false}
            isDisabled={disabled}
            styles={{
                menuPortal: (base) => ({...base, zIndex: 90}),
            }}
        />
    </div>);
}

export default function AnalyticsPage({userId = "default_user", subjectId = "default_subject"}) {
    const [range, setRange] = useState("30d");
    const [rollingWindow, setRollingWindow] = useState(10);
    const [questionType, setQuestionType] = useState("all");
    const [difficulty, setDifficulty] = useState("all");
    const [topicType, setTopicType] = useState("all");

    const filters = useMemo(() => ({
        range, rollingWindow, questionType, difficulty, topicType, minAttempts: 3, limit: 10,
    }), [range, rollingWindow, questionType, difficulty, topicType],);

    const {data, loading, error} = useUserAnalytics(userId, subjectId, filters);
    const overview = data?.overview || {};
    const rollingTrend = data?.rolling_trend || [];
    const weakItems = data?.weak_strong?.weak_items || [];
    const strongItems = data?.weak_strong?.strong_items || [];
    const reviewQueue = data?.review_queue || [];
    const coverageFiles = data?.citation_coverage?.files || [];
    const [openingReviewId, setOpeningReviewId] = useState(null);
    const [coverageFileId, setCoverageFileId] = useState("");
    const [historyItems, setHistoryItems] = useState([]);
    const [historyOffset, setHistoryOffset] = useState(0);
    const [historyHasMore, setHistoryHasMore] = useState(true);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState(null);
    const historyScrollRef = useRef(null);
    const topWeak = weakItems[0] || null;
    const topStrong = strongItems[0] || null;
    const masteryGap = topWeak && topStrong ? Math.max(0, Number(topStrong.accuracy || 0) - Number(topWeak.accuracy || 0)) : null;
    const selectedCoverageFile = coverageFiles.find((f) => f.file_id === coverageFileId) || coverageFiles[0] || null;
    const coverageRows = selectedCoverageFile?.slides || [];

    useEffect(() => {
        if (!coverageFiles.length) {
            setCoverageFileId("");
            return;
        }
        const exists = coverageFiles.some((f) => f.file_id === coverageFileId);
        if (!exists) setCoverageFileId(coverageFiles[0].file_id);
    }, [coverageFiles, coverageFileId]);

    const loadHistoryPage = async (nextOffset, reset = false) => {
        if (historyLoading) return;
        if (!reset && !historyHasMore) return;
        setHistoryLoading(true);
        setHistoryError(null);
        try {
            const page = await fetchAnalyticsHistory(userId, subjectId, filters, nextOffset, 10);
            const rows = Array.isArray(page?.items) ? page.items : [];
            if (reset) {
                setHistoryItems(rows);
            } else {
                setHistoryItems((prev) => [...prev, ...rows]);
            }
            setHistoryOffset(nextOffset + rows.length);
            setHistoryHasMore(Boolean(page?.has_more));
        } catch (err) {
            setHistoryError(err instanceof Error ? err.message : "Failed to load history");
        } finally {
            setHistoryLoading(false);
        }
    };

    useEffect(() => {
        setHistoryItems([]);
        setHistoryOffset(0);
        setHistoryHasMore(true);
        setHistoryError(null);
        void loadHistoryPage(0, true);
    }, [userId, subjectId, filters]);

    const onHistoryScroll = () => {
        const el = historyScrollRef.current;
        if (!el || historyLoading || !historyHasMore) return;
        const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (remaining < 120) {
            void loadHistoryPage(historyOffset, false);
        }
    };

    const openReviewPopup = async (row, source = "queue") => {
        const qid = row?.question_id;
        if (!qid) return;
        if (openingReviewId) return;
        setOpeningReviewId(qid);

        try {
            const detail = await fetchQuestionDetail(qid);
            const question = normalizeQuestion(detail);
            const reference = buildReference(detail, row);
            const fileId = detail?.file_id || row?.file_id || null;
            const slideNums = parseSlideNums(detail?.metadata?.SLIDE);
            const questionWithReference = {
                ...question, ...(reference ? {reference} : {}), ...(fileId ? {fileId} : {}), ...(slideNums.length ? {slideNums} : {}),
            };
            const answerRaw = source === "history" ? row.user_answer : (row.latest_user_answer ?? row.user_answer);
            const correctRaw = source === "history" ? row.correct : (row.latest_correct ?? row.correct);
            const scoreRaw = source === "history" ? row.score_percent : (row.latest_score_percent ?? row.score_percent);

            const latestAnswer = normalizeLatestAnswer(question.type, answerRaw);
            const latestCorrect = Boolean(correctRaw);
            const latestScorePercent = Number(scoreRaw ?? (latestCorrect ? 100 : 0));

            const payload = {
                quizMeta: {
                    id: `review-${qid}`,
                    title: "Question Review",
                    subject: "Analytics Review",
                    numQuestions: 1,
                    difficulty: detail?.difficulty || row?.difficulty || "-",
                },
                settings: {
                    numQuestions: 1,
                    difficulty: detail?.difficulty || row?.difficulty || "-",
                    types: [questionWithReference.type],
                    scopes: [detail?.topic_type || row?.topic_type || "-"],
                    revisitFailed: false,
                    timeLimitOn: false,
                    timeLimitMins: 0,
                },
                questions: [questionWithReference],
                userId,
                subjectId,
                reviewMode: true,
                initialAnswers: {[questionWithReference.id]: latestAnswer},
                initialResults: {
                    score_pct: Math.round(latestScorePercent * 10) / 10,
                    correct: latestCorrect ? 1 : 0,
                    total: 1,
                    results: {
                        [questionWithReference.id]: {
                            correct: latestCorrect, score: latestScorePercent,
                        },
                    },
                },
            };

            sessionStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(payload));
            const popupWidth = window.screen?.availWidth || 1280;
            const popupHeight = window.screen?.availHeight || 860;
            const popup = window.open("/studio?mode=quiz", `reviewQuestion_${qid}`, `width=${popupWidth},height=${popupHeight},left=0,top=0,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`,);
            if (popup && !popup.closed) {
                try {
                    popup.moveTo(0, 0);
                    popup.resizeTo(popupWidth, popupHeight);
                } catch (_) {
                    // Browser may block move/resize calls.
                }
            }
            if (!popup || popup.closed) {
                alert("Popup blocked. Allow popups for this site, then try again.");
            }
        } catch (err) {
            console.error("Failed to open review popup:", err);
            alert("Failed to open review popup.");
        } finally {
            setOpeningReviewId(null);
        }
    };

    if (loading) {
        return (<div className="analyticsShell">
            <div className="an-stateCard">Loading analytics...</div>
        </div>);
    }

    if (error) {
        return (<div className="analyticsShell">
            <div className="an-stateCard">
                <div className="an-stateTitle">Could not load analytics</div>
                <div className="an-stateSub">{error}</div>
                <button className="an-btn" onClick={() => window.location.reload()}>
                    Retry
                </button>
            </div>
        </div>);
    }

    return (<div className="analyticsShell">
        <div className="an-topRow">
            <div className="an-pageTitleWrap">
                <h1 className="an-pageTitle">Analytics</h1>
                <div className="an-pageSub">Rolling average, weak areas, and review priorities</div>
            </div>

            <div className="an-controls">
                <div className="an-controlBlock">
                    <div className="an-controlLabel">Range</div>
                    <AnalyticsSelect
                        value={range}
                        onValueChange={setRange}
                        triggerClassName="an-reactSelectWrap--compact"
                        options={[{value: "7d", label: "7 days"}, {value: "30d", label: "30 days"}, {
                            value: "90d",
                            label: "90 days"
                        }, {value: "all", label: "All"},]}
                    />
                </div>
                <div className="an-controlBlock">
                    <div className="an-controlLabel">Rolling window</div>
                    <AnalyticsSelect
                        value={String(rollingWindow)}
                        onValueChange={(v) => setRollingWindow(Number(v))}
                        triggerClassName="an-reactSelectWrap--compact"
                        options={[{value: "5", label: "5 attempts"}, {
                            value: "10",
                            label: "10 attempts"
                        }, {value: "20", label: "20 attempts"},]}
                    />
                </div>
                <div className="an-controlBlock">
                    <div className="an-controlLabel">Type</div>
                    <AnalyticsSelect
                        value={questionType}
                        onValueChange={setQuestionType}
                        triggerClassName="an-reactSelectWrap--compact"
                        options={[{value: "all", label: "All"}, {value: "MCQ", label: "MCQ"}, {
                            value: "TEXT",
                            label: "Short Answer"
                        },]}
                    />
                </div>
                <div className="an-controlBlock">
                    <div className="an-controlLabel">Difficulty</div>
                    <AnalyticsSelect
                        value={difficulty}
                        onValueChange={setDifficulty}
                        triggerClassName="an-reactSelectWrap--compact"
                        options={[{value: "all", label: "All"}, {value: "Easy", label: "Easy"}, {
                            value: "Medium",
                            label: "Medium"
                        }, {value: "Hard", label: "Hard"},]}
                    />
                </div>
                <div className="an-controlBlock">
                    <div className="an-controlLabel">Topic</div>
                    <AnalyticsSelect
                        value={topicType}
                        onValueChange={setTopicType}
                        triggerClassName="an-reactSelectWrap--compact"
                        options={[{value: "all", label: "All"}, {
                            value: "Theory",
                            label: "Theory"
                        }, {value: "Applied", label: "Applied"},]}
                    />
                </div>
            </div>
        </div>

        <section className="an-card an-summaryCard">
            <div className="an-cardHead">
                <h2 className="an-cardTitle">Overview</h2>
                <div className="an-cardHint">At-a-glance performance snapshot</div>
            </div>
            <div className="an-summaryGrid">
                <div className="an-kpi">
                    <div className="an-kpiLabel">Current rolling avg</div>
                    <div className="an-kpiValue">{percent(overview.current_rolling_avg)}</div>
                    <div className="an-cardHint">Average score across your latest N attempts.</div>
                </div>
                <div className="an-kpi">
                    <div className="an-kpiLabel">Overall average</div>
                    <div className="an-kpiValue">{percent(overview.overall_avg_score)}</div>
                    <div className="an-cardHint">Mean score across all filtered attempts.</div>
                </div>
                <div className="an-kpi">
                    <div className="an-kpiLabel">Improvement</div>
                    <div className="an-kpiValue">{scoreDelta(overview.improvement_pp)}</div>
                    <div className="an-cardHint">Current rolling avg minus previous rolling avg.</div>
                </div>
                <div className="an-kpi">
                    <div className="an-kpiLabel">Accuracy</div>
                    <div className="an-kpiValue">{percent(overview.accuracy_percent)}</div>
                    <div className="an-cardHint">Percent of attempts marked correct.</div>
                </div>
                <div className="an-kpi">
                    <div className="an-kpiLabel">Attempts</div>
                    <div className="an-kpiValue">{overview.total_attempts || 0}</div>
                    <div className="an-cardHint">Total attempts included by current filters.</div>
                </div>
                <div className="an-kpi">
                    <div className="an-kpiLabel">Best streak</div>
                    <div className="an-kpiValue">{overview.best_streak || 0}</div>
                    <div className="an-cardHint">Longest consecutive correct attempts (all time for this subject).
                    </div>
                </div>
            </div>
        </section>

        <section className="an-card">
            <div className="an-cardHead">
                <h3 className="an-cardTitle">Rolling average trend</h3>
                <div className="an-cardHint">Single smoothed line.
                    Window: {overview.rolling_window || rollingWindow} attempts.
                </div>
            </div>
            <div className="an-chartBox">
                <ResponsiveContainer>
                    <LineChart data={rollingTrend} margin={{top: 10, right: 10, left: 0, bottom: 10}}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)"/>
                        <XAxis
                            dataKey="attempted_at"
                            tickFormatter={shortDate}
                            tick={{fontSize: 11, fill: "var(--text-secondary)"}}
                        />
                        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`}
                               tick={{fontSize: 11, fill: "var(--text-secondary)"}}/>
                        <Tooltip
                            contentStyle={{
                                borderRadius: "var(--radius-md)",
                                border: "1px solid var(--border-color)",
                                backgroundColor: "var(--bg-primary)",
                                color: "var(--text-primary)",
                                fontSize: 13,
                            }}
                            cursor={{fill: "var(--table-row-hover)"}}
                            labelFormatter={(v) => new Date(v).toLocaleString()}
                        />
                        <Line type="monotone" dataKey="rolling_avg" stroke="var(--primary-blue)" dot={false}
                              strokeWidth={2.4}/>
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </section>

        <section className="an-card">
            <div className="an-cardHead an-cardHeadInline">
                <div>
                    <h3 className="an-cardTitle">Citation coverage by slide</h3>
                    <div className="an-cardHint">How often each slide is cited by attempted questions.</div>
                </div>
                <div className="an-controlBlock">
                    <div className="an-controlLabel">File</div>
                    <AnalyticsSelect
                        value={selectedCoverageFile?.file_id}
                        onValueChange={setCoverageFileId}
                        disabled={coverageFiles.length === 0}
                        placeholder="No files"
                        options={coverageFiles.map((f) => ({
                            value: f.file_id, label: truncateText(f.file_name, 54),
                        }))}
                    />
                </div>
            </div>
            <div className="an-chartBox">
                {coverageRows.length === 0 ? (
                    <div className="an-mutedCell">No citation data yet for this filter.</div>) : (
                    <ResponsiveContainer>
                        <BarChart data={coverageRows} margin={{top: 10, right: 10, left: 0, bottom: 10}}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)"/>
                            <XAxis
                                dataKey="slide"
                                tick={{fontSize: 11, fill: "var(--text-secondary)"}}
                                label={{
                                    value: "Slide number",
                                    position: "insideBottom",
                                    offset: -4,
                                    fill: "var(--text-secondary)",
                                    fontSize: 11,
                                }}
                            />
                            <YAxis
                                domain={[0, (dataMax) => {
                                    const max = Number(dataMax ?? 0);
                                    if (!Number.isFinite(max)) return 100;
                                    return Math.min(100, Math.max(10, Math.ceil(max + 5)));
                                }]}
                                tickFormatter={(v) => `${v}%`}
                                tick={{fontSize: 11, fill: "var(--text-secondary)"}}
                            />
                            <Tooltip
                                contentStyle={{
                                    borderRadius: "var(--radius-md)",
                                    border: "1px solid var(--border-color)",
                                    backgroundColor: "var(--bg-primary)",
                                    color: "var(--text-primary)",
                                    fontSize: 13,
                                }}
                                cursor={{fill: "var(--table-row-hover)"}}
                                formatter={(v, _, row) => [`${v}%`, `Slide ${row?.payload?.slide}`]}
                            />
                            <Bar dataKey="coverage_percent" fill="var(--primary-blue)" radius={[4, 4, 0, 0]}/>
                        </BarChart>
                    </ResponsiveContainer>)}
            </div>
        </section>

        <section className="an-grid2">
            <div className="an-card">
                <div className="an-cardHead">
                    <h3 className="an-cardTitle">Weak areas</h3>
                    <div className="an-cardHint">Low accuracy with enough attempts</div>
                </div>
                <div className="an-tableWrap">
                    <table className="an-table">
                        <thead>
                        <tr>
                            <th>Area</th>
                            <th>Type</th>
                            <th>Acc</th>
                            <th>Attempts</th>
                        </tr>
                        </thead>
                        <tbody>
                        {weakItems.length === 0 ? (<tr>
                            <td colSpan={4} className="an-mutedCell">No weak areas yet.</td>
                        </tr>) : weakItems.map((x) => (<tr key={`${x.type}:${x.key}`}>
                            <td className="an-muted">{truncateText(areaValueLabel(x.type, x.key))}</td>
                            <td className="an-muted">{areaTypeLabel(x.type)}</td>
                            <td className="an-strong">{percent(x.accuracy)}</td>
                            <td className="an-muted">{x.attempts}</td>
                        </tr>))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="an-card">
                <div className="an-cardHead">
                    <h3 className="an-cardTitle">Strong areas</h3>
                    <div className="an-cardHint">Highest-performing buckets</div>
                </div>
                <div className="an-tableWrap">
                    <table className="an-table">
                        <thead>
                        <tr>
                            <th>Area</th>
                            <th>Type</th>
                            <th>Acc</th>
                            <th>Attempts</th>
                        </tr>
                        </thead>
                        <tbody>
                        {strongItems.length === 0 ? (<tr>
                            <td colSpan={4} className="an-mutedCell">No strong areas yet.</td>
                        </tr>) : strongItems.map((x) => (<tr key={`${x.type}:${x.key}`}>
                            <td className="an-muted">{truncateText(areaValueLabel(x.type, x.key))}</td>
                            <td className="an-muted">{areaTypeLabel(x.type)}</td>
                            <td className="an-strong">{percent(x.accuracy)}</td>
                            <td className="an-muted">{x.attempts}</td>
                        </tr>))}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>

        <section className="an-card">
            <div className="an-cardHead">
                <h3 className="an-cardTitle">Focus strategy</h3>
                <div className="an-cardHint">Mastery gap plus next session plan</div>
            </div>
            <div className="an-miniList">
                <div className="an-miniRow">
                    <div className="an-miniLeft">Mastery gap</div>
                    <div className="an-miniRight">{masteryGap == null ? "-" : `${Math.round(masteryGap)}pp`}</div>
                </div>
                <div className="an-miniRow">
                    <div className="an-miniLeft">Weakest area</div>
                    <div className="an-miniRight">
                        {topWeak ? `${truncateText(areaValueLabel(topWeak.type, topWeak.key), 32)} (${percent(topWeak.accuracy)})` : "-"}
                    </div>
                </div>
                <div className="an-miniRow">
                    <div className="an-miniLeft">Strongest area</div>
                    <div className="an-miniRight">
                        {topStrong ? `${truncateText(areaValueLabel(topStrong.type, topStrong.key), 32)} (${percent(topStrong.accuracy)})` : "-"}
                    </div>
                </div>
                <div className="an-miniRow">
                    <div className="an-miniLeft">Plan</div>
                    <div className="an-miniRight">
                        {topWeak ? "Start with weak area, then finish with 2 reinforcement questions from strong area." : "Generate more attempts to unlock guidance."}
                    </div>
                </div>
            </div>
        </section>

        <section className="an-card">
            <div className="an-cardHead">
                <h3 className="an-cardTitle">Review queue</h3>
                <div className="an-cardHint">Prioritized by repeat misses + low accuracy + recency</div>
            </div>
            <div className="an-tableWrap">
                <table className="an-table">
                    <thead>
                    <tr>
                        <th>Question</th>
                        <th>Reason</th>
                        <th>Wrong</th>
                    </tr>
                    </thead>
                    <tbody>
                    {reviewQueue.length === 0 ? (<tr>
                        <td colSpan={3} className="an-mutedCell">No review queue yet.</td>
                    </tr>) : reviewQueue.slice(0, 10).map((x) => (<tr
                        key={x.question_id}
                        className="an-clickableRow"
                        onClick={() => void openReviewPopup(x, "queue")}
                    >
                        <td className="an-muted">
                            {(x.question_text || "Untitled question").slice(0, 120)}
                        </td>
                        <td className="an-muted">{x.reason || "-"}</td>
                        <td className="an-strong">{x.wrong_count ?? "-"}</td>
                    </tr>))}
                    </tbody>
                </table>
            </div>
        </section>

        <section className="an-card">
            <div className="an-cardHead">
                <h3 className="an-cardTitle">History</h3>
                <div className="an-cardHint">All attempts in newest-first order. Scroll to load more.</div>
            </div>
            <div className="an-historyScroll" ref={historyScrollRef} onScroll={onHistoryScroll}>
                <div className="an-tableWrap">
                    <table className="an-table">
                        <thead>
                        <tr>
                            <th>Time</th>
                            <th>Question</th>
                            <th>Type</th>
                            <th>Difficulty</th>
                            <th>Score</th>
                            <th>Outcome</th>
                        </tr>
                        </thead>
                        <tbody>
                        {historyItems.length === 0 && !historyLoading ? (<tr>
                            <td colSpan={6} className="an-mutedCell">No attempts yet.</td>
                        </tr>) : historyItems.map((h) => (<tr
                            key={h.attempt_id}
                            className="an-clickableRow"
                            onClick={() => void openReviewPopup(h, "history")}
                        >
                            <td className="an-muted">{longDateTime(h.attempted_at)}</td>
                            <td className="an-muted">{truncateText(h.question_text || "Untitled question", 90)}</td>
                            <td className="an-muted">{questionFormatLabel(h.question_type)}</td>
                            <td className="an-muted">{h.difficulty || "-"}</td>
                            <td className="an-strong">{percent(h.score_percent)}</td>
                            <td className="an-muted">{h.correct ? "Right" : "Wrong"}</td>
                        </tr>))}
                        </tbody>
                    </table>
                </div>
                {historyLoading && <div className="an-historyState">Loading more...</div>}
                {historyError && <div className="an-historyState">{historyError}</div>}
                {!historyLoading && !historyHasMore && historyItems.length > 0 && (
                    <div className="an-historyState">End of history.</div>)}
            </div>
        </section>
    </div>);
}
