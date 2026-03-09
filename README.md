# dlw

## Frontend (Vite + React)

Run from project root:

```powershell
npm install
npm run dev
```

Frontend default URL: `http://localhost:5173`

## Backend (FastAPI)

Run from project root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

Backend URLs:
- API root: `http://127.0.0.1:8000/`
- Health check: `http://127.0.0.1:8000/health`
- Docs: `http://127.0.0.1:8000/docs`

## Run frontend + backend together

Install backend Python deps first, then run:

```powershell
npm run dev:full
```

This starts:
- frontend: `npm run dev:frontend` (`http://localhost:5173`)
- backend: `npm run dev:backend` (`http://127.0.0.1:8000`)

## API base URL (frontend -> backend)

Frontend reads backend URL from `VITE_API_BASE`.

Create `.env` in project root:

```env
VITE_API_BASE=http://127.0.0.1:8000
```

If `VITE_API_BASE` is not set, frontend defaults to `http://127.0.0.1:8000`.

## Separate deploy

Use separate deploy targets for frontend and backend.

- Frontend (Vercel): `npm run deploy:frontend`
- Backend (separate platform): `npm run deploy:backend`

Recommended backend hosts: Render, Railway, Fly.io, or Cloud Run.
