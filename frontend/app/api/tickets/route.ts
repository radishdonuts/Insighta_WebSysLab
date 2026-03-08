import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { isEmailConfigured, sendTicketCreatedEmail } from "@/lib/email";
import { normalizeCanonicalComplaintCategory } from "@/lib/nlp/taxonomy";
import { buildNlpInputText, resolveUncategorizedCategoryId } from "@/lib/nlp/ticket-enrichment";
import { getSupabaseServerClient } from "@/lib/supabase";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

type JsonObject = Record<string, unknown>;
type SupabaseServerClient = ReturnType<typeof getSupabaseServerClient>;

type ParsedCreateTicketInput = {
  title: string;
  description: string;
  ticketType: "Complaint";
  customerId: string;
  categoryInput?: string;
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
const MAX_TICKET_NUMBER_RETRIES = 3;
const CUSTOMER_ID_BODY_KEYS = ["customer_id", "customerId", "user_id", "userId"] as const;
const TICKET_REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage.trim();
    }
  }
  return "Unexpected error.";
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

function isMissingColumnError(error: unknown, columnName: string): boolean {
  const message = getErrorMessage(error).toLowerCase();
  const target = `'${columnName.toLowerCase()}'`;
  return message.includes("column") && message.includes(target);
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
  if (!authUserId) {
    throw new ApiError(401, "You must be signed in to submit a ticket.");
  }

  if (hasValueForAnyKey(body, CUSTOMER_ID_BODY_KEYS)) {
    throw new ApiError(400, "customerId is derived from the authenticated session and must not be provided.");
  }

  const title = readFirstString(body, ["title"]);
  const description = readFirstString(body, ["description"]);
  const categoryInput = readFirstString(body, ["category_id", "categoryId", "category_name", "categoryName"]) || undefined;

  if (!title) {
    throw new ApiError(400, "Title is required.");
  }

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

  if (hasValueForAnyKey(body, ["guest_email", "guestEmail", "customer_email", "customerEmail"])) {
    throw new ApiError(400, "guestEmail is no longer supported. Sign in to submit a ticket.");
  }

  if (categoryInput && !isUuid(categoryInput) && !normalizeCanonicalComplaintCategory(categoryInput)) {
    throw new ApiError(400, "Category is invalid.");
  }

  return {
    title,
    description,
    ticketType: "Complaint",
    customerId: authUserId,
    categoryInput,
    nlpText: buildNlpInputText(title, description),
  };
}

async function resolveCategorySelection(
  supabase: SupabaseServerClient,
  categoryInput?: string
): Promise<{ categoryId: string; usedFallbackCategory: boolean; userProvided: boolean }> {
  if (categoryInput) {
    const normalizedCategoryName = normalizeCanonicalComplaintCategory(categoryInput);
    if (normalizedCategoryName) {
      const { data, error } = await supabase
        .from("complaint_categories")
        .select("id")
        .eq("category_name", normalizedCategoryName)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to resolve category: ${error.message}`);
      }

      if (!data?.id) {
        return {
          categoryId: await resolveUncategorizedCategoryId(supabase),
          usedFallbackCategory: true,
          userProvided: false,
        };
      }

      return {
        categoryId: String(data.id),
        usedFallbackCategory: false,
        userProvided: true,
      };
    }

    const { data, error } = await supabase
      .from("complaint_categories")
      .select("id")
      .eq("id", categoryInput)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to resolve category: ${error.message}`);
    }

    if (!data?.id) {
      throw new ApiError(400, "Category not found.");
    }

    return {
      categoryId: String(data.id),
      usedFallbackCategory: false,
      userProvided: true,
    };
  }

  return {
    categoryId: await resolveUncategorizedCategoryId(supabase),
    usedFallbackCategory: true,
    userProvided: false,
  };
}

function buildRandomCode(length: number, alphabet: string): string {
  const bytes = randomBytes(length);
  let value = "";

  for (let index = 0; index < bytes.length; index += 1) {
    value += alphabet[bytes[index] % alphabet.length];
  }

  return value;
}

async function getNextTicketNumber(_supabase: SupabaseServerClient): Promise<string> {
  const value = buildRandomCode(12, TICKET_REFERENCE_ALPHABET);
  return `TRK-${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
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
  const insertPayload: Record<string, unknown> = { ...payload };

  for (let attempt = 1; attempt <= MAX_TICKET_NUMBER_RETRIES; attempt += 1) {
    const ticketNumber = await getNextTicketNumber(supabase);

    const { data, error } = await supabase
      .from("tickets")
      .insert({ ...insertPayload, ticket_number: ticketNumber })
      .select("id, ticket_number, status, priority, submitted_at")
      .single();

    if (!error && data) {
      return data;
    }

    lastError = error;

    if (isMissingColumnError(error, "category_source") || isMissingColumnError(error, "priority_source")) {
      delete insertPayload.category_source;
      delete insertPayload.priority_source;
      continue;
    }

    if (!isTicketNumberConflict(error)) {
      break;
    }
  }

  throw new Error(getErrorMessage(lastError) || "Failed to create ticket.");
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

async function enqueueTicketNlpJob(input: {
  supabase: SupabaseServerClient;
  ticketId: string;
  nlpText: string;
}) {
  const ticketId = asTrimmedString(input.ticketId);
  const nlpText = asTrimmedString(input.nlpText);
  if (!ticketId || !nlpText) return;

  const nowIso = new Date().toISOString();
  const row = {
    ticket_id: ticketId,
    input_text: nlpText,
    status: "pending",
    available_at: nowIso,
    locked_at: null,
    locked_by: null,
    last_error: null,
  };

  const { error } = await input.supabase
    .from("ticket_nlp_jobs")
    .upsert(row, { onConflict: "ticket_id" });

  if (error) {
    const message = getErrorMessage(error);
    if (message.toLowerCase().includes("relation") && message.toLowerCase().includes("ticket_nlp_jobs")) {
      console.warn("[tickets] NLP queue table is unavailable; skipping job enqueue", {
        ticketId,
      });
      return;
    }
    throw new Error(`Failed to enqueue NLP job: ${message}`);
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

    const category = await resolveCategorySelection(supabase, input.categoryInput);

    const insertPayload = compactObject({
      ticket_type: input.ticketType,
      title: input.title || undefined,
      description: input.description,
      nlp_input_text: input.nlpText,
      category_id: category.categoryId,
      category_source: category.userProvided ? "user" : "default",
      priority_source: "default",
      customer_id: input.customerId,
    });

    const ticket = await insertTicketWithRetry(supabase, insertPayload);
    const ticketId = asTrimmedString(ticket.id);

    const attachmentsUploaded = ticketId
      ? await uploadAttachmentsForTicket(supabase, ticketId, payload.files)
      : 0;

    const recipientEmail = asTrimmedString(user?.email);
    await sendTicketCreatedEmailSafe({
      recipientEmail,
      trackingNumber: asTrimmedString(ticket.ticket_number),
      ticketType: input.ticketType,
      ticketId: ticketId || null,
    });

    let nlp: {
      status: "queued";
      applied: false;
      error: string | null;
      prediction: null;
    } | null = null;

    if (ticketId && input.nlpText) {
      try {
        await enqueueTicketNlpJob({
          supabase,
          ticketId,
          nlpText: input.nlpText,
        });
        nlp = {
          status: "queued",
          applied: false,
          error: null,
          prediction: null,
        };
      } catch (error) {
        const message = getErrorMessage(error);
        nlp = {
          status: "queued",
          applied: false,
          error: message,
          prediction: null,
        };
        console.error("[tickets] Failed to enqueue NLP job", {
          ticketId,
          error: message,
        });
      }
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
        attachmentsUploaded,
        nlp,
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
