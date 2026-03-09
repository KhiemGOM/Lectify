/* ============================================================
   quizData.js — ES-module helpers used by the React quiz layer.
   Remove / replace with real API calls once the backend is live.
   ============================================================ */

export const QUIZ_STORAGE_KEY = 'quizforge_session';
export const QUIZ_RESULTS_KEY = 'quizforge_results';

/* ── Mock question banks ─────────────────────────────────── */

function _makeCardiologyQs() {
    return [
        {
            id: 'cq1', type: 'MCQ', format: 'TEXT', slide_refs: [7],
            text: 'A 62-year-old man presents with nocturia, hesitancy and terminal dribbling. PSA 1.3 ng/ml. What is the most appropriate management?',
            reference: 'BPH — Slide 7',
            options: ['Alpha-1 antagonist', '5 alpha-reductase inhibitor', 'Non-urgent TURP referral', 'Ciprofloxacin 2 weeks', 'Urgent urology referral'],
            answer: 0,
        },
        {
            id: 'cq2', type: 'TF', format: 'TEXT', slide_refs: [3],
            text: 'Atrial fibrillation is the most common sustained cardiac arrhythmia and significantly increases stroke risk.',
            reference: 'Arrhythmias — Slide 3',
            options: ['True', 'False'], answer: 0,
        },
        {
            id: 'cq3', type: 'MULTI', format: 'TEXT', slide_refs: [2, 4],
            text: 'Which are recognised risk factors for acute coronary syndrome? (Select all that apply)',
            reference: 'ACS — Slides 2–4',
            options: ['Hypertension', 'Regular moderate exercise', 'Hyperlipidaemia', 'Type 2 diabetes mellitus'],
            answer: [0, 2, 3],
        },
        {
            id: 'cq4', type: 'TEXT', format: 'LATEX', slide_refs: [11],
            text: 'Using $SVR = \\frac{MAP - CVP}{CO} \\times 80$, calculate SVR for MAP=100 mmHg, CVP=4 mmHg, CO=5 L/min.',
            reference: 'Haemodynamics — Slide 11',
            options: [], answer: 'SVR = \\frac{100-4}{5} \\times 80 = 1536',
        },
    ];
}

function _makeCalcQs() {
    return [
        {
            id: 'mq1', type: 'MCQ', format: 'LATEX', slide_refs: [1],
            text: 'Evaluate $\\int_0^1 x^2 \\, dx$.',
            reference: 'Definite Integrals — Slide 1',
            options: ['$\\frac{1}{4}$', '$\\frac{1}{3}$', '$\\frac{1}{2}$', '$1$'], answer: 1,
        },
        {
            id: 'mq2', type: 'TEXT', format: 'LATEX', slide_refs: [3],
            text: 'Find the general solution to $\\frac{dy}{dx} = 2x + 3$.',
            reference: 'ODEs — Slide 3',
            options: [], answer: 'y = x^2 + 3x + C',
        },
        {
            id: 'mq3', type: 'TF', format: 'LATEX', slide_refs: [5],
            text: 'The derivative of $e^{x^2}$ with respect to $x$ is $2xe^{x^2}$.',
            reference: 'Chain Rule — Slide 5',
            options: ['True', 'False'], answer: 0,
        },
    ];
}

function _makePythonQs() {
    return [
        {
            id: 'pq1', type: 'TEXT', format: 'CODE', slide_refs: [4],
            text: 'What does the following function return when called with `n=0`?',
            code_snippet: `def factorial(n):\n    if n == 0:\n        return 1\n    return n * factorial(n - 1)\n\nprint(factorial(0))`,
            reference: 'Recursion — Slide 4',
            options: [], answer: '1 — The base case returns 1 when n equals 0.',
        },
        {
            id: 'pq2', type: 'MULTI', format: 'TEXT', slide_refs: [2],
            text: 'Which of the following are valid Python data types? (Select all that apply)',
            reference: 'Data Types — Slide 2',
            options: ['int', 'float', 'char', 'list', 'tuple'], answer: [0, 1, 3, 4],
        },
    ];
}

function _makeChemQs() {
    return [
        {
            id: 'chq1', type: 'MCQ', format: 'TEXT', slide_refs: [1],
            text: 'Which reagent converts a primary alcohol to an aldehyde without over-oxidation?',
            reference: 'Oxidation — Slide 1',
            options: ['KMnO₄', 'PCC (Pyridinium chlorochromate)', 'Jones reagent', 'Na₂Cr₂O₇'], answer: 1,
        },
        {
            id: 'chq2', type: 'TEXT', format: 'LATEX', slide_refs: [6],
            text: 'Calculate the degree of unsaturation for $C_6H_6$ using $DBE = \\frac{2C + 2 - H}{2}$.',
            reference: 'Aromaticity — Slide 6',
            options: [], answer: 'DBE = \\frac{2(6)+2-6}{2} = 4',
        },
    ];
}

export function getAllMockQuestions() {
    return [
        ..._makeCardiologyQs(),
        ..._makeCalcQs(),
        ..._makePythonQs(),
        ..._makeChemQs(),
    ];
}

/* ── Filter & slice questions given settings ─────────────── */

export function buildQuestions(allQuestions, settings) {
    let qs = [...allQuestions];
    if (settings.types?.length) {
        qs = qs.filter(q => settings.types.includes(q.type));
    }
    return qs.slice(0, settings.numQuestions || qs.length);
}

/* ── Grade a completed quiz ──────────────────────────────── */

export function gradeQuiz(answers, questions) {
    let correct = 0;
    const results = {};

    questions.forEach(q => {
        const ua = answers[q.id];
        let isCorrect = false;

        if (q.type === 'MULTI') {
            const us = Array.isArray(ua) ? [...ua].sort().join(',') : '';
            const cs = Array.isArray(q.answer) ? [...q.answer].sort().join(',') : '';
            isCorrect = us === cs;
        } else if (q.type === 'TEXT') {
            isCorrect = typeof ua === 'string' && ua.replace(/\s/g, '').length > 2;
        } else {
            isCorrect = ua === q.answer;
        }

        if (isCorrect) correct++;
        results[q.id] = {correct: isCorrect, score: isCorrect ? 10 : 0};
    });

    const score_pct = questions.length
        ? Math.round((correct / questions.length) * 1000) / 10
        : 0;

    return {score_pct, correct, total: questions.length, results};
}
