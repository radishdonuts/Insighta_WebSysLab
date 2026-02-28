import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { requireAdminApiAuth } from "@/lib/admin/common";
import { resolveUncategorizedCategoryId, runTicketNlpEnrichment } from "@/lib/nlp/ticket-enrichment";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

type JsonObject = Record<string, unknown>;
type TicketRow = { id?: unknown; description?: unknown };

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error.";
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

function parseLimit(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_LIMIT;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ApiError(400, "limit must be an integer.");
  }

  if (value < 1 || value > MAX_LIMIT) {
    throw new ApiError(400, `limit must be between 1 and ${MAX_LIMIT}.`);
  }

  return value;
}

function parseTicketIds(value: unknown): string[] {
  if (value === undefined) return [];

  if (!Array.isArray(value)) {
    throw new ApiError(400, "ticketIds must be an array of UUID strings.");
  }

  const unique = new Set<string>();
  for (const item of value) {
    const ticketId = asTrimmedString(item);
    if (!ticketId || !isUuid(ticketId)) {
      throw new ApiError(400, "ticketIds must contain only valid UUID strings.");
    }
    unique.add(ticketId);
  }

  return Array.from(unique);
}

async function parseBody(request: Request): Promise<{ ticketIds: string[]; limit: number }> {
  const rawBody = await request.text();
  if (!rawBody.trim()) {
    return { ticketIds: [], limit: DEFAULT_LIMIT };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ApiError(400, "Request body must be a JSON object.");
  }

  const body = payload as JsonObject;
  return {
    ticketIds: parseTicketIds(body.ticketIds),
    limit: parseLimit(body.limit),
  };
}

function hasValidSecret(request: Request): boolean {
  const expected = asTrimmedString(process.env.NLP_REPROCESS_SECRET);
  const provided = asTrimmedString(request.headers.get("x-nlp-reprocess-secret"));

  if (!expected || !provided) return false;

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

async function ensureAuthorized(request: Request): Promise<{ ok: true; method: "secret" | "admin" } | {
  ok: false;
  response: NextResponse;
}> {
  if (hasValidSecret(request)) {
    return { ok: true, method: "secret" };
  }

  const adminAuth = await requireAdminApiAuth();
  if (!adminAuth.ok) {
    return { ok: false, response: adminAuth.response };
  }

  return { ok: true, method: "admin" };
}

async function loadPendingTickets(input: {
  ticketIds: string[];
  limit: number;
}) {
  const supabase = getSupabaseServerClient();

  let query = supabase
    .from("tickets")
    .select("id, description")
    .or("sentiment.is.null,detected_intent.is.null,issue_type.is.null")
    .order("submitted_at", { ascending: false })
    .limit(input.limit);

  if (input.ticketIds.length > 0) {
    query = query.in("id", input.ticketIds);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load pending tickets: ${error.message}`);
  }

  return {
    supabase,
    rows: (Array.isArray(data) ? data : []) as TicketRow[],
  };
}

export async function POST(request: Request) {
  try {
    const auth = await ensureAuthorized(request);
    if (!auth.ok) {
      return auth.response;
    }

    const input = await parseBody(request);
    const { supabase, rows } = await loadPendingTickets(input);

    let uncategorizedCategoryId: string | null = null;
    try {
      uncategorizedCategoryId = await resolveUncategorizedCategoryId(supabase);
    } catch (error) {
      console.warn("[nlp.reprocess] Uncategorized fallback unavailable:", getErrorMessage(error));
    }

    let succeeded = 0;
    let failed = 0;
    const errors: Array<{ ticketId: string; error: string }> = [];

    for (const row of rows) {
      const ticketId = asTrimmedString(row.id);
      const text = asTrimmedString(row.description);

      if (!ticketId || !text) {
        failed += 1;
        errors.push({
          ticketId: ticketId || "unknown",
          error: "Ticket ID or description is missing.",
        });
        continue;
      }

      try {
        await runTicketNlpEnrichment({
          supabase,
          ticketId,
          text,
          allowCategoryOverride: true,
          uncategorizedCategoryId,
        });
        succeeded += 1;
      } catch (error) {
        failed += 1;
        errors.push({
          ticketId,
          error: getErrorMessage(error),
        });
      }
    }

    console.info("[nlp.reprocess] completed", {
      authMethod: auth.method,
      scanned: rows.length,
      attempted: rows.length,
      succeeded,
      failed,
    });

    return NextResponse.json({
      processed: rows.length,
      succeeded,
      failed,
      errors,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error.status, error.message);
    }

    return jsonError(500, getErrorMessage(error));
  }
}
