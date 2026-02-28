from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="Insighta Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class NLPRequest(BaseModel):
    text: str
    ticketId: Optional[str] = None


class NLPResponse(BaseModel):
    sentiment: Optional[str] = None
    detectedIntent: Optional[str] = None
    issueType: Optional[str] = None
    priority: Optional[str] = None
    categoryName: Optional[str] = None
    confidence: Optional[float] = None
    rawOutput: Optional[str] = None


def infer_sentiment(text: str) -> str:
    value = text.lower()
    if any(token in value for token in ["angry", "delay", "failed", "denied", "worst", "frustrated"]):
        return "Negative"
    if any(token in value for token in ["great", "satisfied", "thank", "resolved"]):
        return "Positive"
    return "Neutral"


def infer_priority(text: str) -> str:
    value = text.lower()
    if any(token in value for token in ["urgent", "immediately", "critical", "asap"]):
        return "High"
    if any(token in value for token in ["whenever", "minor", "small issue"]):
        return "Low"
    return "Medium"


def infer_issue_type(text: str) -> Optional[str]:
    value = text.lower()
    if any(token in value for token in ["refund", "charge", "billing", "invoice"]):
        return "Billing"
    if any(token in value for token in ["delivery", "shipment", "tracking", "late"]):
        return "Delivery"
    if any(token in value for token in ["app", "login", "error", "bug", "crash"]):
        return "Technical"
    return None


def infer_detected_intent(text: str) -> str:
    value = text.lower()
    if "refund" in value:
        return "Request Refund"
    if "cancel" in value:
        return "Request Cancellation"
    if "status" in value or "update" in value:
        return "Request Status Update"
    return "General Complaint"


def infer_category_name(issue_type: Optional[str]) -> Optional[str]:
    if issue_type == "Billing":
        return "Billing Issues"
    if issue_type == "Delivery":
        return "Delivery Issues"
    if issue_type == "Technical":
        return "Technical Support"
    return "Uncategorized"


@app.post("/nlp/generate", response_model=NLPResponse)
async def nlp_generate(req: NLPRequest):
    # Scaffold-only logic; replace with model-backed inference later.
    text = req.text.strip()
    issue_type = infer_issue_type(text)

    return NLPResponse(
        sentiment=infer_sentiment(text),
        detectedIntent=infer_detected_intent(text),
        issueType=issue_type,
        priority=infer_priority(text),
        categoryName=infer_category_name(issue_type),
        confidence=0.5,
        rawOutput=f"scaffold-analysis ticketId={req.ticketId or 'n/a'}",
    )


@app.get("/health")
async def health():
    return {"status": "ok"}
