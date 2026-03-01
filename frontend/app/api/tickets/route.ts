import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { isEmailConfigured, sendTicketCreatedEmail } from "@/lib/email";
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

type ParsedRequestPayload = {
  body: JsonObject;
  files: File[];
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
const MAX_GUEST_TRACKING_RETRIES = 4;
const CUSTOMER_ID_BODY_KEYS = ["customer_id", "customerId", "user_id", "userId"] as const;
const TRACKING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_ATTACHMENT_FILES = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set<string>([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "attachments";

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

function mapFormDataToBody(formData: FormData): JsonObject {
  const body: JsonObject = {};

  const entries: Array<[string, string]> = [
    ["title", "title"],
    ["description", "description"],
    ["ticketType", "ticketType"],
    ["guestEmail", "guestEmail"],
    ["guest_email", "guest_email"],
    ["categoryId", "categoryId"],
    ["category_id", "category_id"],
  ];

  for (const [sourceKey, targetKey] of entries) {
    const value = formData.get(sourceKey);
    if (typeof value === "string") {
      body[targetKey] = value;
    }
  }

  return body;
}

function sanitizeFileName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "file";
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function parseFormFiles(formData: FormData): File[] {
  const files = formData
    .getAll("attachments")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length > MAX_ATTACHMENT_FILES) {
    throw new ApiError(400, `You can upload at most ${MAX_ATTACHMENT_FILES} attachments.`);
  }

  for (const file of files) {
    if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
      throw new ApiError(400, `Unsupported attachment type: ${file.name}`);
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new ApiError(400, `Attachment exceeds 10MB: ${file.name}`);
    }
  }

  return files;
}

async function parseRequestPayload(request: Request): Promise<ParsedRequestPayload> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    return {
      body: mapFormDataToBody(formData),
      files: parseFormFiles(formData),
    };
  }

  return {
    body: await parseJsonBody(request),
    files: [],
  };
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
  for (let attempt = 1; attempt <= MAX_GUEST_TRACKING_RETRIES; attempt += 1) {
    const rawToken = buildGuestTrackingCode();

    const { error: insertError } = await supabase.from("ticket_access_tokens").insert({
      ticket_id: ticketId,
      token_hash: rawToken,
      expires_at: new Date(Date.now() + GUEST_TOKEN_TTL_MS).toISOString(),
    });

    if (!insertError) {
      return rawToken;
    }

    const code = getErrorCode(insertError);
    if (code !== "23505") {
      console.error("Failed to store guest access token:", insertError.message);
      return null;
    }
  }

  console.error("Failed to store guest access token: exceeded retry limit.");
  return null;
}

function buildGuestTrackingCode(): string {
  const bytes = randomBytes(12);
  let value = "";

  for (let index = 0; index < bytes.length; index += 1) {
    value += TRACKING_CODE_ALPHABET[bytes[index] % TRACKING_CODE_ALPHABET.length];
  }

  return `TRK-${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
}

async function uploadAttachmentsForTicket(
  supabase: SupabaseServerClient,
  ticketId: string,
  files: File[]
): Promise<number> {
  if (files.length === 0) return 0;

  let uploadedCount = 0;

  for (const file of files) {
    const safeName = sanitizeFileName(file.name);
    const storagePath = `${ticketId}/${Date.now()}-${randomBytes(4).toString("hex")}-${safeName}`;
    const bytes = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, bytes, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });

    if (uploadError) {
      throw new Error(`Failed to upload attachment ${file.name}: ${uploadError.message}`);
    }

    const { error: attachmentError } = await supabase.from("attachments").insert({
      ticket_id: ticketId,
      file_name: file.name,
      file_type: file.type || null,
      file_path: storagePath,
    });

    if (attachmentError) {
      throw new Error(`Failed to save attachment metadata for ${file.name}: ${attachmentError.message}`);
    }

    uploadedCount += 1;
  }

  return uploadedCount;
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

async function sendTicketCreatedEmailSafe(input: {
  recipientEmail: string | null;
  trackingNumber: string | null;
  ticketType: string;
  ticketId: string | null;
}) {
  if (!isEmailConfigured()) {
    return;
  }

  const recipientEmail = asTrimmedString(input.recipientEmail);
  const trackingNumber = asTrimmedString(input.trackingNumber);

  if (!recipientEmail || !trackingNumber) {
    return;
  }

  try {
    await sendTicketCreatedEmail({
      to: recipientEmail,
      trackingNumber,
      ticketType: input.ticketType,
    });
  } catch (error) {
    console.error("[tickets] Failed to send ticket creation email", {
      ticketId: input.ticketId,
      recipientEmail,
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

    const payload = await parseRequestPayload(request);
    const body = payload.body;
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

    const guestAccessToken = ticketId
      ? await createGuestAccessToken(supabase, ticketId)
      : null;

    const attachmentsUploaded = ticketId
      ? await uploadAttachmentsForTicket(supabase, ticketId, payload.files)
      : 0;

    const recipientEmail = input.guestEmail ?? asTrimmedString(user?.email);
    await sendTicketCreatedEmailSafe({
      recipientEmail,
      trackingNumber: guestAccessToken,
      ticketType: input.ticketType,
      ticketId: ticketId || null,
    });

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
        ...(guestAccessToken && guestId ? { accessToken: guestAccessToken } : {}),
        attachmentsUploaded,
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
