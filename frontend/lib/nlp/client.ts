export type NlpSentiment = "Negative" | "Neutral" | "Positive";
export type NlpPriority = "Low" | "Medium" | "High";

export type NlpAnalysisRequest = {
  text: string;
  ticketId?: string | null;
};

export type NlpAnalysisResponse = {
  sentiment: NlpSentiment | null;
  detectedIntent: string | null;
  issueType: string | null;
  priority: NlpPriority | null;
  categoryName: string | null;
  confidence: number | null;
  rawOutput: string | null;
};

const ALLOWED_SENTIMENTS = new Set<NlpSentiment>(["Negative", "Neutral", "Positive"]);
const ALLOWED_PRIORITIES = new Set<NlpPriority>(["Low", "Medium", "High"]);

export class NlpClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string,
    public readonly details?: string
  ) {
    super(message);
    this.name = "NlpClientError";
  }
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSentiment(value: unknown): NlpSentiment | null {
  const raw = asTrimmedString(value);
  if (!raw) return null;

  const key = raw.toLowerCase();
  const normalized =
    key === "negative" ? "Negative" : key === "neutral" ? "Neutral" : key === "positive" ? "Positive" : raw;

  return ALLOWED_SENTIMENTS.has(normalized as NlpSentiment)
    ? (normalized as NlpSentiment)
    : null;
}

function normalizePriority(value: unknown): NlpPriority | null {
  const raw = asTrimmedString(value);
  if (!raw) return null;

  const key = raw.toLowerCase();
  const normalized = key === "low" ? "Low" : key === "medium" ? "Medium" : key === "high" ? "High" : raw;

  return ALLOWED_PRIORITIES.has(normalized as NlpPriority)
    ? (normalized as NlpPriority)
    : null;
}

function normalizeConfidence(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function normalizeNlpPayload(payload: unknown): NlpAnalysisResponse {
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};

  const detectedIntent = asTrimmedString(record.detectedIntent) || asTrimmedString(record.detected_intent) || null;
  const issueType = asTrimmedString(record.issueType) || asTrimmedString(record.issue_type) || null;
  const categoryName = asTrimmedString(record.categoryName) || asTrimmedString(record.category_name) || null;
  const rawOutput =
    asTrimmedString(record.rawOutput) ||
    asTrimmedString(record.raw_output) ||
    asTrimmedString(record.output) ||
    asTrimmedString(record.response) ||
    null;

  return {
    sentiment: normalizeSentiment(record.sentiment),
    detectedIntent,
    issueType,
    priority: normalizePriority(record.priority),
    categoryName,
    confidence: normalizeConfidence(record.confidence),
    rawOutput,
  };
}

export function getNlpEndpoint() {
  const fastApiBase = process.env.FASTAPI_URL ?? "http://127.0.0.1:8000";
  return `${fastApiBase.replace(/\/$/, "")}/nlp/generate`;
}

export async function requestNlpAnalysis(input: NlpAnalysisRequest): Promise<NlpAnalysisResponse> {
  const text = asTrimmedString(input.text);
  const endpoint = getNlpEndpoint();

  if (!text) {
    throw new NlpClientError("Text is required.", 400, endpoint);
  }

  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        ...(asTrimmedString(input.ticketId) ? { ticketId: asTrimmedString(input.ticketId) } : {}),
      }),
    });
  } catch (error) {
    throw new NlpClientError(
      "FastAPI NLP endpoint unavailable.",
      502,
      endpoint,
      error instanceof Error ? error.message : undefined
    );
  }

  if (!response.ok) {
    let details = "";

    try {
      const errorPayload = (await response.json()) as Record<string, unknown>;
      details =
        asTrimmedString(errorPayload.error) ||
        asTrimmedString(errorPayload.detail) ||
        asTrimmedString(errorPayload.message);
    } catch {
      details = asTrimmedString(await response.text());
    }

    throw new NlpClientError(
      details || "FastAPI NLP endpoint unavailable.",
      502,
      endpoint,
      details || undefined
    );
  }

  const payload = (await response.json()) as unknown;
  return normalizeNlpPayload(payload);
}
