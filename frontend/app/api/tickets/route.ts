import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

type JsonObject = Record<string, unknown>;
type SupabaseServerClient = ReturnType<typeof getSupabaseServerClient>;

type ParsedCreateTicketInput = {
  description: string;
  ticketType: string;
  priority?: string;
  customerId?: string;
  guestEmail?: string;
  categoryIdInput?: string;
  categoryNameInput?: string;
  nlp: {
    sentiment?: string;
    detected_intent?: string;
    issue_type?: string;
  };
};

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Keep these aligned with the actual Supabase enum values.
const ALLOWED_TICKET_TYPES = new Set(["Complaint", "Feedback"]);
const ALLOWED_PRIORITIES = new Set(["Low", "Medium", "High"]);
const ALLOWED_SENTIMENTS = new Set(["Negative", "Neutral", "Positive"]);
const GUEST_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TICKET_NUMBER_RETRIES = 3;

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json(
    details ? { error, details } : { error },
    { status }
  );
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readFirstString(body: JsonObject, keys: string[]): string {
  for (const key of keys) {
    const value = asTrimmedString(body[key]);
    if (value) return value;
  }
  return "";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizePriority(raw: string): string {
  const key = raw.toLowerCase();
  if (key === "low") return "Low";
  if (key === "medium") return "Medium";
  if (key === "high") return "High";
  return raw;
}

function normalizeTicketType(raw: string): string {
  const key = raw.toLowerCase();
  if (key === "complaint") return "Complaint";
  if (key === "feedback") return "Feedback";
  return raw;
}

function normalizeSentiment(raw: string): string {
  const key = raw.toLowerCase();
  if (key === "negative") return "Negative";
  if (key === "neutral") return "Neutral";
  if (key === "positive") return "Positive";
  return raw;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error.";
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const maybeCode = (error as { code?: unknown }).code;
  return typeof maybeCode === "string" ? maybeCode : undefined;
}

function isTicketNumberConflict(error: unknown): boolean {
  const code = getErrorCode(error);
  const message = getErrorMessage(error).toLowerCase();
  return (code === "23505" || message.includes("duplicate")) && message.includes("ticket_number");
}

function isPayloadConstraintError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("invalid input value for enum") ||
    message.includes("violates foreign key constraint") ||
    message.includes("violates check constraint")
  );
}

async function parseJsonBody(request: Request): Promise<JsonObject> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "Request body must be a JSON object.");
  }

  return body as JsonObject;
}

function parseCreateTicketInput(body: JsonObject): ParsedCreateTicketInput {
  const description = readFirstString(body, ["description"]);
  if (!description) {
    throw new ApiError(400, "Description is required.");
  }

  // Keep backward-compatible aliases so older clients continue to work.
  const customerId = readFirstString(body, ["customer_id", "customerId", "user_id", "userId"]) || undefined;
  const guestEmailRaw =
    readFirstString(body, ["guest_email", "guestEmail", "customer_email", "customerEmail"]) || undefined;
  const guestEmail = guestEmailRaw?.toLowerCase();

  if (customerId && guestEmail) {
    throw new ApiError(400, "Provide either customerId or guestEmail, not both.");
  }

  if (!customerId && !guestEmail) {
    throw new ApiError(400, "Either customerId (logged-in) or guestEmail must be provided.");
  }

  if (customerId && !isUuid(customerId)) {
    throw new ApiError(400, "Customer ID must be a valid UUID.");
  }

  if (guestEmail && !isValidEmail(guestEmail)) {
    throw new ApiError(400, "Guest email is invalid.");
  }

  const rawPriority = readFirstString(body, ["priority"]);
  const priority = rawPriority ? normalizePriority(rawPriority) : undefined;

  if (priority && !ALLOWED_PRIORITIES.has(priority)) {
    throw new ApiError(400, "Priority must be one of: Low, Medium, High.");
  }

  const rawTicketType = readFirstString(body, ["ticket_type", "ticketType", "type"]);
  const ticketType = rawTicketType ? normalizeTicketType(rawTicketType) : "Complaint";

  if (!ALLOWED_TICKET_TYPES.has(ticketType)) {
    throw new ApiError(400, "Ticket type must be one of: Complaint, Feedback.");
  }

  const rawSentiment = readFirstString(body, ["sentiment"]);
  const sentiment = rawSentiment ? normalizeSentiment(rawSentiment) : undefined;

  if (sentiment && !ALLOWED_SENTIMENTS.has(sentiment)) {
    throw new ApiError(400, "Sentiment must be one of: Negative, Neutral, Positive.");
  }

  return {
    description,
    ticketType,
    priority,
    customerId,
    guestEmail,
    categoryIdInput: readFirstString(body, ["category_id", "categoryId"]) || undefined,
    categoryNameInput:
      readFirstString(body, ["category", "category_name", "categoryName"]) || undefined,
    nlp: {
      sentiment,
      detected_intent: readFirstString(body, ["detected_intent", "detectedIntent"]) || undefined,
      issue_type: readFirstString(body, ["issue_type", "issueType"]) || undefined,
    },
  };
}

async function resolveGuestId(supabase: SupabaseServerClient, email: string): Promise<string> {
  const { data: existing, error: selectError } = await supabase
    .from("guest_contacts")
    .select("id")
    .eq("email", email)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to look up guest contact: ${selectError.message}`);
  }

  if (existing?.id) {
    return String(existing.id);
  }

  const { data: inserted, error: insertError } = await supabase
    .from("guest_contacts")
    .insert({ email })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    throw new Error(insertError?.message ?? "Failed to create guest contact.");
  }

  return String(inserted.id);
}

async function resolveCategoryId(
  supabase: SupabaseServerClient,
  input: Pick<ParsedCreateTicketInput, "categoryIdInput" | "categoryNameInput">
): Promise<string> {
  if (input.categoryIdInput) {
    if (!isUuid(input.categoryIdInput)) {
      throw new ApiError(400, "Category ID must be a valid UUID.");
    }

    const { data, error } = await supabase
      .from("complaint_categories")
      .select("id")
      .eq("id", input.categoryIdInput)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to resolve category: ${error.message}`);
    }

    if (!data?.id) {
      throw new ApiError(400, "Category not found or inactive.");
    }

    return String(data.id);
  }

  if (input.categoryNameInput) {
    // Try exact match first, then case-insensitive fallback for friendlier client input.
    const exact = await supabase
      .from("complaint_categories")
      .select("id")
      .eq("category_name", input.categoryNameInput)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (exact.error) {
      throw new Error(`Failed to resolve category: ${exact.error.message}`);
    }

    if (exact.data?.id) {
      return String(exact.data.id);
    }

    const fallback = await supabase
      .from("complaint_categories")
      .select("id")
      .ilike("category_name", input.categoryNameInput)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (fallback.error) {
      throw new Error(`Failed to resolve category: ${fallback.error.message}`);
    }

    if (fallback.data?.id) {
      return String(fallback.data.id);
    }
  }

  // Last fallback: use the oldest active category so the insert still succeeds.
  const { data: defaultCategory, error: defaultError } = await supabase
    .from("complaint_categories")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (defaultError) {
    throw new Error(`Failed to resolve default category: ${defaultError.message}`);
  }

  if (!defaultCategory?.id) {
    throw new ApiError(400, "No active complaint category found.");
  }

  return String(defaultCategory.id);
}

async function getNextTicketNumber(supabase: SupabaseServerClient): Promise<string> {
  const { data, error } = await supabase
    .from("tickets")
    .select("ticket_number")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to generate ticket number: ${error.message}`);
  }

  const current = asTrimmedString(data?.ticket_number);
  const match = /^TKT-(\d+)$/.exec(current);
  const nextNumber = match ? Number.parseInt(match[1], 10) + 1 : 1;
  return `TKT-${String(nextNumber).padStart(5, "0")}`;
}

function compactObject<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined && value !== "")
  ) as Partial<T>;
}

async function insertTicketWithRetry(
  supabase: SupabaseServerClient,
  payload: Record<string, unknown>
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_TICKET_NUMBER_RETRIES; attempt += 1) {
    const ticketNumber = await getNextTicketNumber(supabase);

    const { data, error } = await supabase
      .from("tickets")
      .insert({ ...payload, ticket_number: ticketNumber })
      .select("id, ticket_number, status, priority, submitted_at")
      .single();

    if (!error && data) {
      return data;
    }

    lastError = error;

    // Concurrent inserts can collide on the unique ticket_number.
    if (!isTicketNumberConflict(error)) {
      break;
    }
  }

  throw new Error(getErrorMessage(lastError) || "Failed to create ticket.");
}

async function createGuestAccessToken(
  supabase: SupabaseServerClient,
  ticketId: string
): Promise<string | null> {
  // Guests receive the raw token; only the hash is stored in the database.
  const rawToken = randomBytes(32).toString("hex");

  const { data: hashResult, error: hashError } = await supabase.rpc("sha256_hex", {
    input: rawToken,
  });

  if (hashError || !hashResult) {
    console.error("Failed to hash guest token:", hashError?.message);
    return null;
  }

  const { error: insertError } = await supabase.from("ticket_access_tokens").insert({
    ticket_id: ticketId,
    token_hash: String(hashResult),
    expires_at: new Date(Date.now() + GUEST_TOKEN_TTL_MS).toISOString(),
  });

  if (insertError) {
    console.error("Failed to store guest access token:", insertError.message);
    return null;
  }

  return rawToken;
}

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    const input = parseCreateTicketInput(body);
    const supabase = getSupabaseServerClient();

    const categoryId = await resolveCategoryId(supabase, input);
    const guestId = input.guestEmail ? await resolveGuestId(supabase, input.guestEmail) : null;

    const insertPayload = compactObject({
      ticket_type: input.ticketType,
      description: input.description,
      category_id: categoryId,
      customer_id: input.customerId,
      guest_id: guestId ?? undefined,
      priority: input.priority,
      ...input.nlp,
    });

    const ticket = await insertTicketWithRetry(supabase, insertPayload);
    const guestAccessToken = guestId && ticket.id
      ? await createGuestAccessToken(supabase, String(ticket.id))
      : null;

    return NextResponse.json(
      {
        message: "Ticket created successfully.",
        ticket: {
          id: ticket.id ?? null,
          reference: ticket.ticket_number ?? null,
          status: ticket.status ?? null,
          priority: ticket.priority ?? null,
          createdAt: ticket.submitted_at ?? null,
        },
        ...(guestAccessToken ? { accessToken: guestAccessToken } : {}),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error.status, error.message, error.details);
    }

    if (isPayloadConstraintError(error)) {
      return jsonError(400, "Invalid ticket payload.", getErrorMessage(error));
    }

    return jsonError(500, "Failed to create ticket.", getErrorMessage(error));
  }
}
