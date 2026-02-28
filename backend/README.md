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
| POST   | /nlp/generate   | Process a complaint prompt via NLP |
| GET    | /health         | Health check                       |

## Request example

```bash
curl -X POST http://127.0.0.1:8000/nlp/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "My claim was denied unfairly"}'
```
