import type { AdminActivityLogsResponse, AdminActivityLogItem, AdminActivityLogUser } from "@/types/admin-ops";
import {
  asNullableTrimmedString,
  asTrimmedString,
  firstRow,
  type AdminSupabaseServerClient,
} from "@/lib/admin/common";

export { getAdminSupabase } from "@/lib/admin/common";
export { requireAdminApiAuth } from "@/lib/admin/common";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

type ParsedActivityLogsQuery = {
  page: number;
  pageSize: number;
  action: string | null;
  entityType: string | null;
  user: string | null;
  userId: string | null;
  from: string | null;
  to: string | null;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parsePositiveIntParam(value: string | null, label: "page" | "pageSize", fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || String(parsed) !== value) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return parsed;
}

function toUtcDayStartIso(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`).toISOString();
}

function toUtcNextDayStartIso(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function validateFilterToken(label: string, value: string, maxLength: number) {
  if (value.length > maxLength) {
    throw new Error(`${label} filter must be ${maxLength} characters or fewer.`);
  }

  if (!/^[A-Za-z0-9_.:-]+$/.test(value)) {
    throw new Error(`${label} filter may only contain letters, numbers, underscores, hyphens, dots, and colons.`);
  }

  return value;
}

export function parseAdminActivityLogsQuery(searchParams: URLSearchParams): ParsedActivityLogsQuery {
  const page = parsePositiveIntParam(searchParams.get("page"), "page", DEFAULT_PAGE);
  const pageSize = parsePositiveIntParam(searchParams.get("pageSize"), "pageSize", DEFAULT_PAGE_SIZE);

  if (pageSize > MAX_PAGE_SIZE) {
    throw new Error(`pageSize must be ${MAX_PAGE_SIZE} or smaller.`);
  }

  const rawAction = asNullableTrimmedString(searchParams.get("action"));
  const rawEntityType = asNullableTrimmedString(searchParams.get("entityType"));
  const rawUser = asNullableTrimmedString(searchParams.get("user"));
  const rawUserId = asNullableTrimmedString(searchParams.get("userId"));
  const rawFrom = asNullableTrimmedString(searchParams.get("from"));
  const rawTo = asNullableTrimmedString(searchParams.get("to"));

  const action = rawAction ? validateFilterToken("Action", rawAction, 80) : null;
  const entityType = rawEntityType ? validateFilterToken("Entity type", rawEntityType, 80) : null;

  if (rawUser && rawUser.length > 120) {
    throw new Error("User filter must be 120 characters or fewer.");
  }

  if (rawUserId && !isUuid(rawUserId)) {
    throw new Error("userId filter must be a valid UUID.");
  }

  if (rawFrom && !isDateKey(rawFrom)) {
    throw new Error("from filter must use YYYY-MM-DD format.");
  }

  if (rawTo && !isDateKey(rawTo)) {
    throw new Error("to filter must use YYYY-MM-DD format.");
  }

  if (rawFrom && rawTo && rawFrom > rawTo) {
    throw new Error("from date cannot be later than to date.");
  }

  return {
    page,
    pageSize,
    action,
    entityType,
    user: rawUser ?? null,
    userId: rawUserId ?? null,
    from: rawFrom ?? null,
    to: rawTo ?? null,
  };
}

function mapActivityUser(row: unknown): AdminActivityLogUser | null {
  const user = firstRow(row as Record<string, unknown> | Record<string, unknown>[] | null | undefined);
  if (!user || typeof user !== "object") return null;

  const record = user as Record<string, unknown>;
  const id = asTrimmedString(record.id);
  if (!id) return null;

  return {
    id,
    email: asNullableTrimmedString(record.email),
    firstName: asNullableTrimmedString(record.first_name),
    lastName: asNullableTrimmedString(record.last_name),
  };
}

function mapActivityLogItem(row: Record<string, unknown>): AdminActivityLogItem {
  return {
    id: asTrimmedString(row.id),
    action: asTrimmedString(row.action),
    entityType: asTrimmedString(row.entity_type),
    entityId: asNullableTrimmedString(row.entity_id),
    timestamp: asNullableTrimmedString(row.timestamp),
    user: mapActivityUser(row.user),
  };
}

async function resolveUserIdsBySearch(
  supabase: AdminSupabaseServerClient,
  userSearch: string
): Promise<string[]> {
  const ids = new Set<string>();

  if (isUuid(userSearch)) {
    ids.add(userSearch);
  }

  const like = `%${userSearch}%`;
  const fields: Array<"email" | "first_name" | "last_name"> = ["email", "first_name", "last_name"];

  for (const field of fields) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .ilike(field, like)
      .limit(25);

    if (error) {
      throw new Error(`Failed to filter users by ${field}: ${error.message}`);
    }

    for (const row of Array.isArray(data) ? data : []) {
      const id = asTrimmedString((row as Record<string, unknown>).id);
      if (id) ids.add(id);
    }
  }

  return Array.from(ids);
}

export async function getAdminActivityLogs(
  supabase: AdminSupabaseServerClient,
  query: ParsedActivityLogsQuery
): Promise<AdminActivityLogsResponse> {
  let userFilterIds: string[] | null = null;

  if (query.user) {
    userFilterIds = await resolveUserIdsBySearch(supabase, query.user);
    if (userFilterIds.length === 0) {
      return {
        data: [],
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total: 0,
          totalPages: 1,
        },
        filters: {
          action: query.action,
          entityType: query.entityType,
          user: query.user,
          userId: query.userId,
          from: query.from,
          to: query.to,
        },
      };
    }
  }

  let request = supabase
    .from("system_activity_logs")
    .select(
      `
      id,
      user_id,
      action,
      entity_type,
      entity_id,
      timestamp,
      user:profiles!system_activity_logs_user_id_fkey (
        id,
        email,
        first_name,
        last_name
      )
      `,
      { count: "exact" }
    )
    .order("timestamp", { ascending: false });

  if (query.action) request = request.eq("action", query.action);
  if (query.entityType) request = request.eq("entity_type", query.entityType);
  if (query.userId) request = request.eq("user_id", query.userId);
  if (userFilterIds && userFilterIds.length > 0) request = request.in("user_id", userFilterIds);
  if (query.from) request = request.gte("timestamp", toUtcDayStartIso(query.from));
  if (query.to) request = request.lt("timestamp", toUtcNextDayStartIso(query.to));

  const fromIndex = (query.page - 1) * query.pageSize;
  const toIndex = fromIndex + query.pageSize - 1;

  const { data, error, count } = await request.range(fromIndex, toIndex);

  if (error) {
    throw new Error(`Failed to load system activity logs: ${error.message}`);
  }

  const total = typeof count === "number" ? count : 0;
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

  return {
    data: (Array.isArray(data) ? data : []).map((row) => mapActivityLogItem(row as Record<string, unknown>)),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages,
    },
    filters: {
      action: query.action,
      entityType: query.entityType,
      user: query.user,
      userId: query.userId,
      from: query.from,
      to: query.to,
    },
  };
}

type SystemActivityWriteArgs = {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  ipAddress?: string | null;
};

export async function writeSystemActivityLog(
  supabase: AdminSupabaseServerClient,
  args: SystemActivityWriteArgs
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

function splitForwardedFor(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first || null;
}

export function getRequestIpAddress(headers: Headers): string | null {
  return splitForwardedFor(headers.get("x-forwarded-for")) ?? asNullableTrimmedString(headers.get("x-real-ip"));
}
