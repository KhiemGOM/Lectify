import React, {useState} from "react";
import "../styles/QuizSettings.css";
import {getAllMockQuestions, buildQuestions, QUIZ_STORAGE_KEY, QUIZ_RESULTS_KEY} from "../utils/quizData";
import {fetchFailedQuestions, generateQuestion, mapApiQuestion} from "../utils/api";
import LoadingModal from "./LoadingModal";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";

const REVISIT_STOPS = [0, 25, 50, 75, 100];
const TYPE_LABELS = {
    MCQ: "MCQ",
    TF: "True/False",
    MULTI: "Multi",
    TEXT: "Short Answer",
};
const revisitModeLabel = (percent) => {
    if (percent <= 0) return "Always fresh";
    if (percent >= 100) return "Always failed";
    return `${percent}% failed`;
};

const snapRevisitPercent = (value) => {
    const n = Number(value);
    if (Number.isNaN(n)) return 0;
    return REVISIT_STOPS.reduce((best, cur) =>
        Math.abs(cur - n) < Math.abs(best - n) ? cur : best
    , REVISIT_STOPS[0]);
};

const getStored = (key, fallback) => {
    try {
        const v = localStorage.getItem('quizSettings_' + key);
        return v !== null ? JSON.parse(v) : fallback;
    } catch {
        return fallback;
    }
};

const usePersisted = (key, fallback) => {
    const [val, setVal] = useState(() => getStored(key, fallback));
    const set = (v) => {
        setVal(v);
        try {
            localStorage.setItem('quizSettings_' + key, JSON.stringify(v));
        } catch {
        }
    };
    return [val, set];
};

export default function QuizSettings({session, userId = 'default_user'}) {

    const prefix = `quizSettings_${session?.id ?? 'default'}_`;

    const [numQuestions, setNumQuestions] = usePersisted(prefix + 'numQuestions', 10);
    const [difficulty, setDifficulty] = usePersisted(prefix + 'difficulty', 'Mixed');
    const [types, setTypes] = usePersisted(prefix + 'types', ['MCQ', 'TF', 'MULTI', 'TEXT']);
    const [scopes, setScopes] = usePersisted(prefix + 'scopes', ['Theory', 'Applied']);
    const [timerEnabled, setTimerEnabled] = usePersisted(prefix + 'timerEnabled', false);
    const oldRevisitToggle = getStored(prefix + 'revisitFailed', false);
    const [revisitFailedPercent, setRevisitFailedPercent] = usePersisted(
        prefix + 'revisitFailedPercent',
        oldRevisitToggle ? 25 : 0,
    );
    const [timeMins, setTimeMins] = usePersisted(prefix + 'timeMins', 15);
    const [generating, setGenerating] = useState(false);
    const revisitPercent = snapRevisitPercent(revisitFailedPercent);


    const stepNum = (delta) => {
        setNumQuestions(Math.max(1, Math.min(180, (numQuestions || 0) + delta)));
    };

    const toggleType = (type) => {
        const next = types.includes(type)
            ? types.filter((t) => t !== type)
            : [...types, type];
        setTypes(next);
    };

    const toggleScope = (scope) => {
        const next = scopes.includes(scope)
            ? scopes.filter((s) => s !== scope)
            : [...scopes, scope];
        setScopes(next);
    };

    const getDifficulty = (difficulty) => {
        if (difficulty === 'Mixed') {
            return ['Easy', 'Medium', 'Hard'][Math.floor(Math.random() * 3)];
        }
        return difficulty;
    };

    const launchQuiz = async () => {
        if (generating) return;
        setGenerating(true);

        const settings = {
            numQuestions,
            difficulty,
            types,
            scopes,
            revisitFailed: revisitPercent > 0,
            revisitFailedPercent: revisitPercent,
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
            const validScopes = scopes.length > 0 ? scopes : ["Theory"];
            const fileNameById = new Map(
                sessionFiles.map((f) => [String(f.fileId ?? ""), f.filename ?? "Reference"]),
            );

            const shuffleArray = (arr) => [...arr].sort(() => Math.random() - 0.5);

            // Flatten all chunks from all files, keeping file reference
            const allChunks = sessionFiles.flatMap(f =>
                f.chunks.map(chunk => ({chunk, fileObj: f}))
            );
            const createBag = (arr) => {
                let bag = [];
                return () => {
                    if (bag.length === 0) bag = shuffleArray([...arr]);
                    return bag.pop();
                };
            };
            const nextChunk = createBag(allChunks);


            let revisitQuestions = [];
            const targetFailedCount = Math.min(
                numQuestions,
                Math.max(0, Math.round((numQuestions * revisitPercent) / 100)),
            );
            if (targetFailedCount > 0) {
                try {
                    const res = await fetchFailedQuestions(userId, String(session?.id ?? 'default_subject'), {
                        types: validTypes,
                        scopes: validScopes,
                        difficulty: difficulty === 'Mixed' ? null : difficulty,
                        limit: targetFailedCount,
                    });
                    revisitQuestions = (res.questions ?? []).map(q => {
                        const resolvedFilename =
                            q.filename ??
                            fileNameById.get(String(q.file_id ?? "")) ??
                            "Reference";
                        const fakeApiRes = {
                            question_id: q.question_id,
                            raw: {
                                question_text: q.question_text,
                                options: q.options ?? [],
                                answer: q.answer,
                                metadata: q.metadata ?? {},
                            }
                        };
                        return {
                            ...mapApiQuestion(fakeApiRes, q.format_type, resolvedFilename, null, q.file_id ?? null),
                            isRevisit: true,
                        };
                    });
                } catch (err) {
                    console.warn('Failed to fetch revisit questions:', err);
                }
            }

            const freshCount = numQuestions - revisitQuestions.length;
            const promises = Array.from({length: freshCount}, (_, i) => {
                const {chunk, fileObj} = nextChunk();
                const settingsType = validTypes[Math.floor(Math.random() * validTypes.length)];
                const settingsScope = validScopes[Math.floor(Math.random() * validScopes.length)];

                return generateQuestion(fileObj.fileId, chunk, settingsScope, settingsType, getDifficulty(difficulty), session?.context ?? '', userId, String(session?.id ?? 'default_subject'))
                    .then((res) => mapApiQuestion(res, settingsType, fileObj.filename, chunk, fileObj.fileId))
                    .catch((err) => {
                        console.error("Question generation failed:", err);
                        return null;
                    });
            });

            const resolved = await Promise.all(promises);
            const freshQuestions = resolved.filter(Boolean);

            // Shuffle revisit and fresh together
            questions = shuffleArray([...revisitQuestions, ...freshQuestions]);
        } else {
            console.error('[QuizSettings] No session files found, session:', session);
            alert('No uploaded files found in this session. Please upload slides before starting a quiz.');
            setGenerating(false);
            return;
            // Remove or comment out the mock fallback below if you don't want it
            // questions = buildQuestions(getAllMockQuestions(), settings);
        }

        sessionStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify({
            quizMeta,
            settings,
            questions,
            userId,
            subjectId: String(session?.id ?? 'default_subject')
        }));

        const popupWidth = window.screen?.availWidth || 1280;
        const popupHeight = window.screen?.availHeight || 860;
        const features = [
            `width=${popupWidth}`, `height=${popupHeight}`,
            "left=0", "top=0",
            "menubar=no", "toolbar=no", "location=no",
            "status=no", "resizable=yes", "scrollbars=yes",
        ].join(",");

        localStorage.removeItem(QUIZ_RESULTS_KEY);
        console.log('[QuizSettings] opening popup, questions:', questions.length, questions);
        const popup = window.open("/studio?mode=quiz", "quizWindow", features);
        console.log('[QuizSettings] popup result:', popup, 'closed:', popup?.closed);
        if (popup && !popup.closed) {
            try {
                popup.moveTo(0, 0);
                popup.resizeTo(popupWidth, popupHeight);
            } catch (_) {
                // Browser may block move/resize calls.
            }
        }
        setGenerating(false);

        if (!popup || popup.closed) {
            alert(
                'Your browser blocked the quiz window.\n\n' +
                'To fix: click the popup-blocked icon in your address bar and allow popups from this site, then click "Start Quiz →" again.'
            );
        }
    };

    const summaryTypeText = types.length > 0
        ? types.map((t) => TYPE_LABELS[t] ?? t).join(", ")
        : "No types selected";
    const summaryText = `${numQuestions} questions · ${difficulty} · ${
        summaryTypeText
    } · ${revisitModeLabel(revisitPercent)}${timerEnabled ? ` · ${timeMins} min` : ""}`;

    return (
        <div className="qs-page">
            {generating && <LoadingModal message="Generating quiz questions…"/>}
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
                        <input
                            type="number"
                            className="qs-stepper-val"
                            value={numQuestions}
                            onChange={(e) => setNumQuestions(e.target.value === '' ? '' : Number(e.target.value))}
                            onBlur={(e) => setNumQuestions(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                        />
                        <button className="qs-stepper-btn" onClick={() => stepNum(1)}>+</button>
                    </div>
                </div>
                <div className="qs-row">
                    <div className="qs-label-wrap">
                        <div className="qs-label">Revisit failed questions</div>
                        <div className="qs-desc">Mix ratio from always fresh to always failed questions</div>
                    </div>
                    <div className="qs-revisit-wrap">
                        <div className="qs-revisit-top">
                            <span className="qs-revisit-mode">{revisitModeLabel(revisitPercent)}</span>
                        </div>
                        <label
                            className="qs-revisit-slider-wrap"
                        >
                            <Slider
                                min={0}
                                max={100}
                                step={25}
                                dots
                                value={revisitPercent}
                                onChange={(value) => setRevisitFailedPercent(snapRevisitPercent(value))}
                                className="qs-revisit-slider-lib"
                            />
                        </label>
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
                        <div className="qs-label">Format</div>
                        <div className="qs-desc">How the question is presented</div>
                    </div>
                    <div className="qs-chips">
                        {[
                            {label: "MCQ", value: "MCQ"},
                            {label: "True/False", value: "TF"},
                            {label: "Multi", value: "MULTI"},
                            {label: "Short Answer", value: "TEXT"},
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
                <div className="qs-row">
                    <div className="qs-label-wrap">
                        <div className="qs-label">Scope</div>
                        <div className="qs-desc">Theory tests concepts, Applied tests real-world usage</div>
                    </div>
                    <div className="qs-chips">
                        {[
                            {label: "Theory", value: "Theory"},
                            {label: "Applied", value: "Applied"},
                        ].map((scope) => (
                            <button
                                key={scope.value}
                                className={`qs-chip${scopes.includes(scope.value) ? " active" : ""}`}
                                onClick={() => toggleScope(scope.value)}
                            >
                                {scope.label}
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
