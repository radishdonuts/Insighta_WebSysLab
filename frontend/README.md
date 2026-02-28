# Insighta Frontend

Next.js (App Router) + TypeScript frontend for Insighta.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

Create a `.env` file in this folder:

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=attachments
FASTAPI_URL=http://127.0.0.1:8000
```

## NLP flow

`POST /api/nlp` in Next.js forwards `{ prompt }` to the FastAPI backend at:
`$FASTAPI_URL/nlp/generate`.
