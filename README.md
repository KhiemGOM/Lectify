# Lectify

Lectify is an AI-powered study app that turns uploaded learning materials into quizzes, tracks performance, and highlights what to review next.

## What It Does

- Upload slides/docs and generate quiz questions.
- Run timed or untimed quizzes with mixed formats (MCQ, True/False, Multi, Short Answer).
- Revisit failed questions with adjustable ratio.
- Review results and citations.
- Analyze progress with rolling average, weak/strong areas, and history.

## Tech Stack

- Frontend: React + Vite
- Backend: FastAPI (Python)
- Data/Auth/Storage: Firebase (Firestore/Auth/Storage)
- AI: OpenAI API

## Project Structure

```text
backend/            FastAPI app, AI routes, Firebase integration
src/                React app
public/             Static assets
```

## Prerequisites

- Node.js 18+
- Python 3.10+
- Firebase project credentials for backend access
- OpenAI API key

## Environment

Create a root `.env` file (or copy from `.env.example`):

```env
VITE_API_BASE=http://127.0.0.1:8000
OPENAI_API_KEY=your_openai_key
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
FIREBASE_PROJECT_ID=your_firebase_project_id
```

Notes:
- `VITE_API_BASE` is used by the frontend.
- Backend requires `OPENAI_API_KEY` for generation/grading.
- Backend uses Firebase Admin credentials via `GOOGLE_APPLICATION_CREDENTIALS`.

## Local Development

Install frontend deps:

```powershell
npm install
```

Create Python venv and backend deps:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

Run frontend only:

```powershell
npm run dev
```

Run frontend + backend together:

```powershell
npm run dev:full
```

Default URLs:
- Frontend: `http://localhost:5173`
- Backend: `http://127.0.0.1:8000`
- Backend docs: `http://127.0.0.1:8000/docs`

## Scripts

- `npm run dev` -> frontend dev server
- `npm run dev:frontend` -> frontend dev server
- `npm run dev:backend` -> FastAPI dev server
- `npm run dev:full` -> run frontend + backend in parallel
- `npm run build` -> frontend production build
- `npm run lint` -> ESLint

## Deploy Strategy

Use split deployment:

- Frontend on Vercel (`npm run deploy:frontend`)
- Backend on Render/Railway/Fly.io/Cloud Run (`npm run deploy:backend` is a placeholder)

This keeps Vercel focused on static/frontend hosting while the Python API runs on a backend host.

## Troubleshooting

- Popup blocked for quiz/citation:
  - Allow popups for your local/site origin.
- Backend starts but generation fails:
  - Check `OPENAI_API_KEY`.
- Backend cannot read/write Firebase:
  - Check `GOOGLE_APPLICATION_CREDENTIALS` and `FIREBASE_PROJECT_ID`.
- Frontend cannot reach backend:
  - Check `VITE_API_BASE` and backend URL/port.
