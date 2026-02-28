import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { buildNlpInputText, runTicketNlpEnrichment, resolveUncategorizedCategoryId } from "@/lib/nlp/ticket-enrichment";
import { getSupabaseServerClient } from "@/lib/supabase";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

type JsonObject = Record<string, unknown>;
type SupabaseServerClient = ReturnType<typeof getSupabaseServerClient>;

type ParsedCreateTicketInput = {
  title: string;
  description: string;
  ticketType: "Complaint";
  customerId?: string;
  guestEmail?: string;
  categoryIdInput?: string;
  nlpText: string;
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

const TITLE_MAX_LENGTH = 120;
const DESCRIPTION_MIN_LENGTH = 20;
const DESCRIPTION_MAX_LENGTH = 5000;
const GUEST_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TICKET_NUMBER_RETRIES = 3;
const CUSTOMER_ID_BODY_KEYS = ["customer_id", "customerId", "user_id", "userId"] as const;

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json(
    details ? { error, details } : { error },
    { status }
  );
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readFirstString(body: JsonObject, keys: readonly string[]): string {
  for (const key of keys) {
    const value = asTrimmedString(body[key]);
    if (value) return value;
  }

  return "";
}

function hasValueForAnyKey(body: JsonObject, keys: readonly string[]): boolean {
  return keys.some((key) => asTrimmedString(body[key]).length > 0);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

function parseCreateTicketInput(
  body: JsonObject,
  authUserId: string | null
): ParsedCreateTicketInput {
  if (hasValueForAnyKey(body, CUSTOMER_ID_BODY_KEYS)) {
    throw new ApiError(400, "customerId is derived from the authenticated session and must not be provided.");
  }

  const title = readFirstString(body, ["title"]);
  const description = readFirstString(body, ["description"]);
  const guestEmailRaw =
    readFirstString(body, ["guest_email", "guestEmail", "customer_email", "customerEmail"]) || undefined;
  const guestEmail = guestEmailRaw?.toLowerCase();
  const categoryIdInput = readFirstString(body, ["category_id", "categoryId"]) || undefined;

  if (title.length > TITLE_MAX_LENGTH) {
    throw new ApiError(400, `Title must be ${TITLE_MAX_LENGTH} characters or fewer.`);
  }

  if (!description) {
    throw new ApiError(400, "Description is required.");
  }

  if (description.length < DESCRIPTION_MIN_LENGTH) {
    throw new ApiError(400, `Description must be at least ${DESCRIPTION_MIN_LENGTH} characters.`);
  }

  if (description.length > DESCRIPTION_MAX_LENGTH) {
    throw new ApiError(400, `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer.`);
  }

  const rawTicketType = readFirstString(body, ["ticket_type", "ticketType", "type"]);
  if (rawTicketType && rawTicketType.toLowerCase() !== "complaint") {
    throw new ApiError(400, 'ticketType must be "Complaint".');
  }

  if (authUserId && guestEmail) {
    throw new ApiError(400, "guestEmail cannot be provided when authenticated.");
  }

  if (!authUserId) {
    if (!guestEmail) {
      throw new ApiError(400, "guestEmail is required when submitting anonymously.");
    }

    if (!isValidEmail(guestEmail)) {
      throw new ApiError(400, "Guest email is invalid.");
    }
  }

  if (categoryIdInput && !isUuid(categoryIdInput)) {
    throw new ApiError(400, "Category ID must be a valid UUID.");
  }

  return {
    title,
    description,
    ticketType: "Complaint",
    customerId: authUserId ?? undefined,
    guestEmail: authUserId ? undefined : guestEmail,
    categoryIdInput,
    nlpText: buildNlpInputText(title, description),
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

async function resolveCategorySelection(
  supabase: SupabaseServerClient,
  categoryIdInput?: string
): Promise<{ categoryId: string; usedFallbackCategory: boolean }> {
  if (categoryIdInput) {
    const { data, error } = await supabase
      .from("complaint_categories")
      .select("id")
      .eq("id", categoryIdInput)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to resolve category: ${error.message}`);
    }

    if (!data?.id) {
      throw new ApiError(400, "Category not found or inactive.");
    }

    return {
      categoryId: String(data.id),
      usedFallbackCategory: false,
    };
  }

  return {
    categoryId: await resolveUncategorizedCategoryId(supabase),
    usedFallbackCategory: true,
  };
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

async function runAsyncNlpEnrichment(input: {
  supabase: SupabaseServerClient;
  ticketId: string;
  text: string;
  allowCategoryOverride: boolean;
  uncategorizedCategoryId?: string | null;
}) {
  console.info("[tickets] NLP enrichment started", { ticketId: input.ticketId });

  try {
    const result = await runTicketNlpEnrichment({
      supabase: input.supabase,
      ticketId: input.ticketId,
      text: input.text,
      allowCategoryOverride: input.allowCategoryOverride,
      uncategorizedCategoryId: input.uncategorizedCategoryId ?? null,
    });

    console.info("[tickets] NLP enrichment completed", {
      ticketId: input.ticketId,
      nlpFieldsUpdated: result.nlpFieldsUpdated,
      categoryUpdated: result.categoryUpdated,
    });
  } catch (error) {
    console.error("[tickets] NLP enrichment failed", {
      ticketId: input.ticketId,
      error: getErrorMessage(error),
    });
  }
}

export async function POST(request: Request) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    const body = await parseJsonBody(request);
    const input = parseCreateTicketInput(body, user?.id ?? null);
    const supabase = getSupabaseServerClient();

    const category = await resolveCategorySelection(supabase, input.categoryIdInput);
    const guestId = input.guestEmail ? await resolveGuestId(supabase, input.guestEmail) : null;

    const insertPayload = compactObject({
      ticket_type: input.ticketType,
      description: input.description,
      category_id: category.categoryId,
      customer_id: input.customerId,
      guest_id: guestId ?? undefined,
    });

    const ticket = await insertTicketWithRetry(supabase, insertPayload);
    const ticketId = asTrimmedString(ticket.id);

    const guestAccessToken = guestId && ticketId
      ? await createGuestAccessToken(supabase, ticketId)
      : null;

    if (ticketId && input.nlpText) {
      void runAsyncNlpEnrichment({
        supabase,
        ticketId,
        text: input.nlpText,
        allowCategoryOverride: category.usedFallbackCategory,
        uncategorizedCategoryId: category.usedFallbackCategory ? category.categoryId : null,
      });
    }

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
