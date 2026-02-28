import { NextResponse } from "next/server";

import { NlpClientError, requestNlpAnalysis } from "@/lib/nlp/client";

export const runtime = "nodejs";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function parseRequestBody(request: Request): Promise<{ text: string; ticketId?: string }> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "Request body must be a JSON object.");
  }

  const payload = body as Record<string, unknown>;
  const text = asTrimmedString(payload.text);

  if (!text) {
    throw new ApiError(400, "Text is required.");
  }

  const ticketId = asTrimmedString(payload.ticketId);
  if (ticketId && !isUuid(ticketId)) {
    throw new ApiError(400, "ticketId must be a valid UUID when provided.");
  }

  return ticketId ? { text, ticketId } : { text };
}

export async function POST(request: Request) {
  try {
    const input = await parseRequestBody(request);
    const analysis = await requestNlpAnalysis(input);

    return NextResponse.json(analysis);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof NlpClientError) {
      return NextResponse.json(
        {
          error: error.message,
          endpoint: error.endpoint,
          ...(error.details ? { details: error.details } : {}),
        },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { error: "Failed to run NLP analysis." },
      { status: 500 }
    );
  }
}
