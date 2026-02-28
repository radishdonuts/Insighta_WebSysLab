import { NextResponse } from "next/server";

export function jsonError(status: number, error: string, message?: string) {
  return NextResponse.json(message ? { error, message } : { error }, { status });
}

export function jsonServerError(error: unknown, fallbackMessage: string) {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  return jsonError(500, fallbackMessage, message);
}

export async function parseJsonRequestBody(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new Error("Request body must be valid JSON.");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object.");
  }

  return body as Record<string, unknown>;
}
