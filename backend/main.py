from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Insighta Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class NLPRequest(BaseModel):
    prompt: str


class NLPResponse(BaseModel):
    output: str


@app.post("/nlp/generate", response_model=NLPResponse)
async def nlp_generate(req: NLPRequest):
    # TODO: replace with your actual NLP model inference
    return NLPResponse(output=f"Processed: {req.prompt}")


@app.get("/health")
async def health():
    return {"status": "ok"}
