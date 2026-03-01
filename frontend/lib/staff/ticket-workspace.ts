import { STAFF_WORKSPACE_ROLES } from "@/types/auth";
import {
  STAFF_ASSIGNMENT_FILTERS,
  STAFF_TICKET_TABS,
  type StaffAssignRequest,
  type StaffAssignResponse,
  type StaffAssignmentFilter,
  type StaffCategorySummary,
  type StaffPersonSummary,
  type StaffQueueFilters,
  type StaffStatusUpdateRequest,
  type StaffStatusUpdateResponse,
  type StaffTicketDetail,
  type StaffTicketDetailResponse,
  type StaffTicketFeedback,
  type StaffTicketQueueItem,
  type StaffTicketQueueResponse,
  type StaffTicketTab,
  type StaffTicketStatusHistoryItem,
} from "@/types/staff-tickets";
import { TICKET_PRIORITIES, TICKET_STATUSES } from "@/types/tickets";
import type { ApiRoleGuardSuccess } from "@/lib/auth/api-guards";
import { requireAnyRole } from "@/lib/auth/api-guards";
import { getSupabaseServerClient } from "@/lib/supabase";

type JsonObject = Record<string, unknown>;
type SupabaseServerClient = ReturnType<typeof getSupabaseServerClient>;

type RawProfile = {
  id?: unknown;
  email?: unknown;
  first_name?: unknown;
  last_name?: unknown;
};

type RawCategory = {
  id?: unknown;
  category_name?: unknown;
};

type RawTicketAccessToken = {
  token_hash?: unknown;
};

type MutationNotFound = { ok: false; reason: "not_found" };
type MutationConflict = { ok: false; reason: "conflict"; message: string };
type MutationSuccess<T> = { ok: true; data: T };

export type StaffMutationResult<T> = MutationNotFound | MutationConflict | MutationSuccess<T>;

const TICKET_STATUS_SET = new Set<string>(TICKET_STATUSES);
const TICKET_PRIORITY_SET = new Set<string>(TICKET_PRIORITIES);
const STAFF_TAB_SET = new Set<string>(STAFF_TICKET_TABS);
const STAFF_ASSIGNMENT_FILTER_SET = new Set<string>(STAFF_ASSIGNMENT_FILTERS);
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const STAFF_ATTACHMENT_SIGNED_URL_TTL_SECONDS = 60 * 60;
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "attachments";

export async function requireStaffApiAuth() {
  return requireAnyRole(STAFF_WORKSPACE_ROLES);
}

export function getStaffSupabase() {
  return getSupabaseServerClient();
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableTrimmedString(value: unknown): string | null {
  const trimmed = asTrimmedString(value);
  return trimmed || null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return (value[0] ?? null) as T | null;
  return (value ?? null) as T | null;
}

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function splitForwardedFor(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first || null;
}

function formatDisplayName(firstName: string | null, lastName: string | null, email: string | null): string {
  const full = [firstName, lastName].filter(Boolean).join(" ").trim();
  return full || email || "Unknown User";
}

function mapPerson(raw: RawProfile | null | undefined): StaffPersonSummary | null {
  if (!raw || typeof raw !== "object") return null;

  const id = asString(raw.id);
  if (!id) return null;

  const email = asNullableTrimmedString(raw.email);
  const firstName = asNullableTrimmedString(raw.first_name);
  const lastName = asNullableTrimmedString(raw.last_name);

  return {
    id,
    email,
    firstName,
    lastName,
    displayName: formatDisplayName(firstName, lastName, email),
  };
}

function mapCategory(raw: RawCategory | null | undefined): StaffCategorySummary | null {
  if (!raw || typeof raw !== "object") return null;
  const id = asString(raw.id);
  const name = asNullableTrimmedString(raw.category_name);
  if (!id || !name) return null;
  return { id, name };
}

function safeIso(value: unknown): string {
  return asString(value) ?? new Date(0).toISOString();
}

function inferSubmitterType(customerId: unknown, guestId: unknown): "Customer" | "Guest" | "Unknown" {
  if (asString(customerId)) return "Customer";
  if (asString(guestId)) return "Guest";
  return "Unknown";
}

function readTrackingCode(value: unknown): string | null {
  if (Array.isArray(value)) {
    const preferred = value
      .map((item) => readTrackingCode(item))
      .find((code) => typeof code === "string" && code.startsWith("TRK-"));
    if (preferred) return preferred;

    const fallback = value
      .map((item) => readTrackingCode(item))
      .find((code) => typeof code === "string");
    return fallback ?? null;
  }

  if (!value || typeof value !== "object") return null;
  return asNullableTrimmedString((value as RawTicketAccessToken).token_hash);
}

function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[(),]/g, " ").replace(/\s+/g, " ").trim();
}

function mapQueueItem(row: any): StaffTicketQueueItem {
  const trackingCode = readTrackingCode(row?.ticket_access_tokens);

  return {
    id: asString(row?.id) ?? "",
    ticketNumber: trackingCode ?? asString(row?.ticket_number) ?? "",
    ticketType: asString(row?.ticket_type) ?? "",
    status: asString(row?.status) ?? "",
    priority: asString(row?.priority) ?? "",
    description: asString(row?.description) ?? "",
    submittedAt: safeIso(row?.submitted_at),
    lastUpdatedAt: safeIso(row?.last_updated_at),
    category: mapCategory(row?.category),
    assignedStaff: mapPerson(row?.assigned_staff),
    submitterType: inferSubmitterType(row?.customer_id, row?.guest_id),
  };
}

function mapStatusHistoryItem(row: any): StaffTicketStatusHistoryItem {
  return {
    id: asString(row?.id) ?? "",
    oldStatus: asString(row?.old_status) ?? "",
    newStatus: asString(row?.new_status) ?? "",
    changedAt: safeIso(row?.changed_at),
    remarks: asNullableTrimmedString(row?.remarks),
    changedBy: mapPerson(row?.changed_by),
  };
}

function mapFeedback(row: any): StaffTicketFeedback | null {
  if (!row || typeof row !== "object") return null;
  const id = asString(row.id);
  const rating = asNumber(row.rating);
  if (!id || rating === null) return null;

  const submitterProfile = mapPerson(row.submitted_by_user);
  const guestEmail = asNullableTrimmedString(row.submitted_by_guest?.email);
  const submitterType = submitterProfile ? "Customer" : guestEmail ? "Guest" : "Unknown";

  return {
    id,
    rating,
    comment: asNullableTrimmedString(row.comment),
    submittedAt: safeIso(row.submitted_at),
    submitterType,
    submittedBy: submitterProfile,
    guestEmail,
  };
}

async function createAttachmentSignedUrl(
  supabase: SupabaseServerClient,
  filePath: string
): Promise<string | null> {
  const trimmedPath = filePath.trim();
  if (!trimmedPath) return null;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(trimmedPath, STAFF_ATTACHMENT_SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    console.warn("Failed to create attachment signed URL:", error?.message ?? "missing signed URL");
    return null;
  }

  return data.signedUrl;
}

export function parseStaffQueueFilters(searchParams: URLSearchParams): StaffQueueFilters {
  const tabRaw = asTrimmedString(searchParams.get("tab"));
  const tab = (STAFF_TAB_SET.has(tabRaw) ? tabRaw : "my") as StaffTicketTab;

  const statusRaw = asTrimmedString(searchParams.get("status"));
  const priorityRaw = asTrimmedString(searchParams.get("priority"));
  const categoryId = asTrimmedString(searchParams.get("categoryId")) || undefined;
  const q = sanitizeSearchTerm(asTrimmedString(searchParams.get("q"))) || undefined;
  const page = parsePositiveInt(searchParams.get("page"), DEFAULT_PAGE);
  const pageSize = clamp(parsePositiveInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE), 1, MAX_PAGE_SIZE);

  const assignmentRaw = asTrimmedString(searchParams.get("assignment"));
  const derivedAssignment: StaffAssignmentFilter = tab === "unassigned" ? "unassigned" : "mine";
  const assignment = (
    STAFF_ASSIGNMENT_FILTER_SET.has(assignmentRaw) ? assignmentRaw : derivedAssignment
  ) as StaffAssignmentFilter;

  return {
    tab,
    page,
    pageSize,
    status: TICKET_STATUS_SET.has(statusRaw) ? (statusRaw as StaffQueueFilters["status"]) : undefined,
    priority: TICKET_PRIORITY_SET.has(priorityRaw) ? (priorityRaw as StaffQueueFilters["priority"]) : undefined,
    categoryId,
    assignment,
    q,
  };
}

function applyQueueFilters(query: any, filters: StaffQueueFilters, authUserId: string) {
  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.priority) {
    query = query.eq("priority", filters.priority);
  }

  if (filters.categoryId && isUuid(filters.categoryId)) {
    query = query.eq("category_id", filters.categoryId);
  }

  if (filters.assignment === "mine") {
    query = query.eq("assigned_staff_id", authUserId);
  } else if (filters.assignment === "unassigned") {
    query = query.is("assigned_staff_id", null);
  } else if (filters.assignment === "assigned") {
    query = query.not("assigned_staff_id", "is", null);
  }

  if (filters.q) {
    const term = sanitizeSearchTerm(filters.q);
    if (term) {
      query = query.or(`ticket_number.ilike.%${term}%,description.ilike.%${term}%`);
    }
  }

  return query;
}

async function listActiveCategories(supabase: SupabaseServerClient): Promise<StaffCategorySummary[]> {
  const { data, error } = await supabase
    .from("complaint_categories")
    .select("id, category_name")
    .eq("is_active", true)
    .order("category_name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load categories: ${error.message}`);
  }

  return (Array.isArray(data) ? data : []).map(mapCategory).filter(Boolean) as StaffCategorySummary[];
}

export async function listStaffTickets(
  supabase: SupabaseServerClient,
  filters: StaffQueueFilters,
  authUserId: string
): Promise<StaffTicketQueueResponse> {
  const from = (filters.page - 1) * filters.pageSize;
  const to = from + filters.pageSize - 1;

  let query: any = supabase
    .from("tickets")
    .select(
      `
        id,
        ticket_number,
        ticket_type,
        status,
        priority,
        description,
        submitted_at,
        last_updated_at,
        category_id,
        customer_id,
        guest_id,
        assigned_staff_id,
        ticket_access_tokens!ticket_access_tokens_ticket_id_fkey (token_hash, created_at),
        category:complaint_categories!tickets_category_id_fkey (id, category_name),
        assigned_staff:profiles!tickets_assigned_staff_id_fkey (id, email, first_name, last_name)
      `,
      { count: "exact" }
    )
    .order("created_at", { foreignTable: "ticket_access_tokens", ascending: false })
    .order("last_updated_at", { ascending: false })
    .order("submitted_at", { ascending: false })
    .range(from, to);

  query = applyQueueFilters(query, filters, authUserId);

  const [{ data, error, count }, categoryOptions] = await Promise.all([
    query,
    listActiveCategories(supabase),
  ]);

  if (error) {
    throw new Error(`Failed to load staff tickets: ${error.message}`);
  }

  const total = count ?? 0;
  const totalPages = total === 0 ? 1 : Math.ceil(total / filters.pageSize);

  return {
    data: (Array.isArray(data) ? data : []).map(mapQueueItem),
    pagination: {
      page: clamp(filters.page, 1, totalPages),
      pageSize: filters.pageSize,
      total,
      totalPages,
    },
    filters: {
      ...filters,
      page: clamp(filters.page, 1, totalPages),
    },
    categoryOptions,
  };
}

export async function getStaffTicketDetail(
  supabase: SupabaseServerClient,
  ticketId: string
): Promise<StaffTicketDetailResponse | null> {
  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select(
      `
        id,
        ticket_number,
        ticket_type,
        status,
        priority,
        description,
        submitted_at,
        last_updated_at,
        sentiment,
        detected_intent,
        issue_type,
        customer_id,
        guest_id,
        assigned_staff_id,
        ticket_access_tokens!ticket_access_tokens_ticket_id_fkey (token_hash, created_at),
        category:complaint_categories!tickets_category_id_fkey (id, category_name),
        submitter_profile:profiles!tickets_customer_id_fkey (id, email, first_name, last_name),
        assigned_staff:profiles!tickets_assigned_staff_id_fkey (id, email, first_name, last_name),
        guest_contact:guest_contacts!tickets_guest_id_fkey (id, email)
      `
    )
    .eq("id", ticketId)
    .order("created_at", { foreignTable: "ticket_access_tokens", ascending: false })
    .limit(1)
    .maybeSingle();

  if (ticketError) {
    throw new Error(`Failed to load ticket detail: ${ticketError.message}`);
  }

  if (!ticket) {
    return null;
  }

  const [attachmentsResult, historyResult, feedbackResult] = await Promise.all([
    supabase
      .from("attachments")
      .select("id, file_name, file_type, file_path, uploaded_at")
      .eq("ticket_id", ticketId)
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("ticket_status_history")
      .select(
        `
          id,
          old_status,
          new_status,
          changed_at,
          remarks,
          changed_by:profiles!ticket_status_history_changed_by_user_id_fkey (id, email, first_name, last_name)
        `
      )
      .eq("ticket_id", ticketId)
      .order("changed_at", { ascending: false }),
    supabase
      .from("feedback")
      .select(
        `
          id,
          rating,
          comment,
          submitted_at,
          submitted_by_user:profiles!feedback_submitted_by_user_id_fkey (id, email, first_name, last_name),
          submitted_by_guest:guest_contacts!feedback_submitted_by_guest_id_fkey (id, email)
        `
      )
      .eq("ticket_id", ticketId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (attachmentsResult.error) {
    throw new Error(`Failed to load attachments: ${attachmentsResult.error.message}`);
  }

  if (historyResult.error) {
    throw new Error(`Failed to load status history: ${historyResult.error.message}`);
  }

  if (feedbackResult.error) {
    throw new Error(`Failed to load feedback: ${feedbackResult.error.message}`);
  }

  const attachmentRows = Array.isArray(attachmentsResult.data) ? attachmentsResult.data : [];
  const attachments = await Promise.all(
    attachmentRows.map(async (row: any) => {
      const filePath = asString(row?.file_path) ?? "";
      return {
        id: asString(row?.id) ?? "",
        fileName: asString(row?.file_name) ?? "",
        fileType: asNullableTrimmedString(row?.file_type),
        filePath,
        signedUrl: filePath ? await createAttachmentSignedUrl(supabase, filePath) : null,
        uploadedAt: safeIso(row?.uploaded_at),
      };
    })
  );

  const submitterProfile = mapPerson(firstRow(ticket.submitter_profile));
  const guestContact = firstRow<{ email?: unknown }>(ticket.guest_contact);
  const guestEmail = asNullableTrimmedString(guestContact?.email);
  const trackingCode = readTrackingCode(ticket.ticket_access_tokens);
  const detail: StaffTicketDetail = {
    id: asString(ticket.id) ?? "",
    ticketNumber: trackingCode ?? asString(ticket.ticket_number) ?? "",
    ticketType: asString(ticket.ticket_type) ?? "",
    status: asString(ticket.status) ?? "",
    priority: asString(ticket.priority) ?? "",
    description: asString(ticket.description) ?? "",
    submittedAt: safeIso(ticket.submitted_at),
    lastUpdatedAt: safeIso(ticket.last_updated_at),
    sentiment: asNullableTrimmedString(ticket.sentiment),
    detectedIntent: asNullableTrimmedString(ticket.detected_intent),
    issueType: asNullableTrimmedString(ticket.issue_type),
    category: mapCategory(firstRow(ticket.category)),
    submitterType: submitterProfile ? "Customer" : guestEmail ? "Guest" : "Unknown",
    submitter: submitterProfile,
    guestEmail,
    assignedStaff: mapPerson(firstRow(ticket.assigned_staff)),
    attachments,
    statusHistory: (Array.isArray(historyResult.data) ? historyResult.data : []).map(mapStatusHistoryItem),
    feedback: mapFeedback(feedbackResult.data),
  };

  return { ticket: detail };
}

export async function logSystemActivity(
  supabase: SupabaseServerClient,
  args: {
    userId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    ipAddress?: string | null;
  }
) {
  const { error } = await supabase.from("system_activity_logs").insert({
    user_id: args.userId ?? null,
    action: args.action,
    entity_type: args.entityType,
    entity_id: args.entityId ?? null,
    ip_address: args.ipAddress ?? null,
  });

  if (error) {
    console.error("Failed to write system activity log:", error.message);
  }
}

export function getRequestIpAddress(headers: Headers): string | null {
  return splitForwardedFor(headers.get("x-forwarded-for")) ?? asNullableTrimmedString(headers.get("x-real-ip"));
}

export function parseJsonBodyObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Request body must be a JSON object.");
  }

  return value as JsonObject;
}

export function parseStatusUpdateRequest(body: JsonObject): StaffStatusUpdateRequest {
  const status = asTrimmedString(body.status);
  if (!status || !TICKET_STATUS_SET.has(status)) {
    throw new Error(`Status must be one of: ${TICKET_STATUSES.join(", ")}.`);
  }

  const remarks = asTrimmedString(body.remarks);

  return {
    status,
    remarks: remarks || undefined,
  };
}

export function parseAssignRequest(body: JsonObject): StaffAssignRequest {
  const action = asTrimmedString(body.action);
  if (!action) {
    return {};
  }

  if (action !== "self_assign") {
    throw new Error('Only action "self_assign" is supported.');
  }

  return { action: "self_assign" };
}

export async function updateStaffTicketStatus(
  supabase: SupabaseServerClient,
  ticketId: string,
  actor: ApiRoleGuardSuccess,
  input: StaffStatusUpdateRequest,
  ipAddress?: string | null
): Promise<StaffMutationResult<StaffStatusUpdateResponse>> {
  const { data: existing, error: existingError } = await supabase
    .from("tickets")
    .select("id, ticket_number, status, last_updated_at")
    .eq("id", ticketId)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load ticket: ${existingError.message}`);
  }

  if (!existing?.id) {
    return { ok: false, reason: "not_found" };
  }

  const currentStatus = asString(existing.status) ?? "";
  if (currentStatus === input.status) {
    return {
      ok: true,
      data: {
        message: "Ticket status is already set to the requested value.",
        ticket: {
          id: String(existing.id),
          ticketNumber: asString(existing.ticket_number) ?? "",
          status: currentStatus,
          lastUpdatedAt: safeIso(existing.last_updated_at),
        },
      },
    };
  }

  const { data: updated, error: updateError } = await supabase
    .from("tickets")
    .update({ status: input.status })
    .eq("id", ticketId)
    .select("id, ticket_number, status, last_updated_at")
    .single();

  if (updateError || !updated?.id) {
    throw new Error(updateError?.message ?? "Failed to update ticket status.");
  }

  const { error: historyError } = await supabase.from("ticket_status_history").insert({
    ticket_id: ticketId,
    old_status: currentStatus,
    new_status: input.status,
    changed_by_user_id: actor.userId,
    remarks: input.remarks ?? null,
  });

  if (historyError) {
    throw new Error(`Ticket status updated but failed to write status history: ${historyError.message}`);
  }

  await logSystemActivity(supabase, {
    userId: actor.userId,
    action: "staff_ticket_status_updated",
    entityType: "ticket",
    entityId: ticketId,
    ipAddress,
  });

  return {
    ok: true,
    data: {
      message: "Ticket status updated successfully.",
      ticket: {
        id: String(updated.id),
        ticketNumber: asString(updated.ticket_number) ?? "",
        status: asString(updated.status) ?? "",
        lastUpdatedAt: safeIso(updated.last_updated_at),
      },
    },
  };
}

export async function selfAssignStaffTicket(
  supabase: SupabaseServerClient,
  ticketId: string,
  actor: ApiRoleGuardSuccess,
  ipAddress?: string | null
): Promise<StaffMutationResult<StaffAssignResponse>> {
  const { data: existing, error: existingError } = await supabase
    .from("tickets")
    .select("id, ticket_number, assigned_staff_id, last_updated_at")
    .eq("id", ticketId)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load ticket: ${existingError.message}`);
  }

  if (!existing?.id) {
    return { ok: false, reason: "not_found" };
  }

  const assignedStaffId = asString(existing.assigned_staff_id);

  if (assignedStaffId && assignedStaffId !== actor.userId) {
    return { ok: false, reason: "conflict", message: "Ticket is already assigned to another staff member." };
  }

  if (assignedStaffId === actor.userId) {
    return {
      ok: true,
      data: {
        message: "Ticket is already assigned to you.",
        ticket: {
          id: String(existing.id),
          ticketNumber: asString(existing.ticket_number) ?? "",
          lastUpdatedAt: safeIso(existing.last_updated_at),
          assignedStaff: {
            id: actor.userId,
            email: actor.email,
            firstName: null,
            lastName: null,
            displayName: formatDisplayName(null, null, actor.email),
          },
        },
      },
    };
  }

  const { data: updated, error: updateError } = await supabase
    .from("tickets")
    .update({ assigned_staff_id: actor.userId })
    .eq("id", ticketId)
    .is("assigned_staff_id", null)
    .select("id, ticket_number, assigned_staff_id, last_updated_at")
    .maybeSingle();

  if (updateError) {
    throw new Error(`Failed to assign ticket: ${updateError.message}`);
  }

  if (!updated?.id) {
    return { ok: false, reason: "conflict", message: "Ticket assignment changed. Refresh and try again." };
  }

  await logSystemActivity(supabase, {
    userId: actor.userId,
    action: "staff_ticket_self_assigned",
    entityType: "ticket",
    entityId: ticketId,
    ipAddress,
  });

  return {
    ok: true,
    data: {
      message: "Ticket assigned to you.",
      ticket: {
        id: String(updated.id),
        ticketNumber: asString(updated.ticket_number) ?? "",
        lastUpdatedAt: safeIso(updated.last_updated_at),
        assignedStaff: {
          id: actor.userId,
          email: actor.email,
          firstName: null,
          lastName: null,
          displayName: formatDisplayName(null, null, actor.email),
        },
      },
    },
  };
}
