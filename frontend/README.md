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
NLP_REPROCESS_SECRET=change-me
```

## NLP flow

`POST /api/nlp` in Next.js expects:

```json
{
  "text": "combined title + description",
  "ticketId": "optional-ticket-uuid"
}
```

It forwards to `$FASTAPI_URL/nlp/generate` and returns:

```json
{
  "sentiment": "Negative | Neutral | Positive | null",
  "detectedIntent": "string | null",
  "issueType": "string | null",
  "priority": "Low | Medium | High | null",
  "categoryName": "string | null",
  "confidence": "number | null",
  "rawOutput": "string | null"
}
```

`POST /api/nlp/reprocess` retries NLP enrichment for tickets with missing NLP fields. Auth is either:

1. Header `x-nlp-reprocess-secret: $NLP_REPROCESS_SECRET`
2. An authenticated Admin user session

Request body is optional and supports:

```json
{
  "ticketIds": ["uuid-1", "uuid-2"],
  "limit": 25
}
```
