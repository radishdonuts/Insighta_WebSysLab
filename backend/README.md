# Insighta Backend

FastAPI-based NLP backend for Insighta.

## Run locally

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The server will start at `http://127.0.0.1:8000`.

## Endpoints

| Method | Path            | Description                        |
|--------|-----------------|------------------------------------|
| POST   | /nlp/generate   | Return structured NLP scaffold data |
| GET    | /health         | Health check                       |

## Request example

```bash
curl -X POST http://127.0.0.1:8000/nlp/generate \
  -H "Content-Type: application/json" \
  -d '{"text": "My claim was denied unfairly", "ticketId": "optional-uuid"}'
```

Response shape:

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
