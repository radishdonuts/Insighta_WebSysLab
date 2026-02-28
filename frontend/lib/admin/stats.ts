import {
  TICKET_PRIORITIES,
  TICKET_SENTIMENTS,
  TICKET_STATUSES,
} from "@/types/tickets";
import type {
  AdminStatsBreakdownItem,
  AdminStatsBreakdownsResponse,
  AdminStatsDateRange,
  AdminStatsOverviewResponse,
  AdminTicketTrendPoint,
  AdminTicketsTrendsResponse,
} from "@/types/admin-stats";
import {
  asString,
  firstRow,
  type AdminSupabaseServerClient,
} from "@/lib/admin/common";

const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;
const RESOLVED_STATUSES = new Set<string>(["Resolved", "Closed"]);
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const UTC_DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

type OverviewRow = {
  submitted_at?: unknown;
  status?: unknown;
  assigned_staff_id?: unknown;
};

type TrendsRow = {
  submitted_at?: unknown;
};

type BreakdownCategoryRow = {
  id?: unknown;
  category_name?: unknown;
};

type BreakdownRow = {
  status?: unknown;
  priority?: unknown;
  sentiment?: unknown;
  category?: BreakdownCategoryRow | BreakdownCategoryRow[] | null;
};

export type AdminStatsQueryRange = AdminStatsDateRange & {
  fromIso: string;
  toExclusiveIso: string;
};

export { getAdminSupabase } from "@/lib/admin/common";
export { requireAdminApiAuth } from "@/lib/admin/common";

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return startOfUtcDay(next);
}

function formatDateOnlyUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDateOnlyUtc(value: string | null): Date | null {
  if (!value || !DATE_ONLY_RE.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return formatDateOnlyUtc(parsed) === value ? parsed : null;
}

function toPublicDateRange(range: AdminStatsQueryRange): AdminStatsDateRange {
  return {
    from: range.from,
    to: range.to,
    days: range.days,
  };
}

function slugKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function roundPercentage(count: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function sortBreakdownItems(items: AdminStatsBreakdownItem[]) {
  return [...items].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.label.localeCompare(b.label);
  });
}

function buildKnownValueBreakdown(
  labels: readonly string[],
  counts: Map<string, number>,
  total: number
): AdminStatsBreakdownItem[] {
  return labels.map((label) => {
    const count = counts.get(label) ?? 0;
    return {
      key: slugKey(label),
      label,
      count,
      percentage: roundPercentage(count, total),
    };
  });
}

function buildMapBreakdown(counts: Map<string, number>, total: number): AdminStatsBreakdownItem[] {
  return sortBreakdownItems(
    Array.from(counts.entries()).map(([label, count]) => ({
      key: slugKey(label),
      label,
      count,
      percentage: roundPercentage(count, total),
    }))
  );
}

function startOfUtcIsoWeek(date: Date) {
  const day = date.getUTCDay(); // 0=Sun, 1=Mon
  const mondayOffset = (day + 6) % 7;
  return addUtcDays(startOfUtcDay(date), -mondayOffset);
}

function applySubmittedDateRange(query: any, range: AdminStatsQueryRange) {
  return query.gte("submitted_at", range.fromIso).lt("submitted_at", range.toExclusiveIso);
}

function toUtcDateKey(isoString: string | null): string | null {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  return formatDateOnlyUtc(date);
}

function countByDateRange(
  rows: Array<{ submitted_at?: unknown }>,
  lowerBound: Date,
  upperBoundExclusive: Date
) {
  const lower = lowerBound.getTime();
  const upper = upperBoundExclusive.getTime();
  let count = 0;

  for (const row of rows) {
    const value = asString(row.submitted_at);
    if (!value) continue;
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) continue;
    if (time >= lower && time < upper) {
      count += 1;
    }
  }

  return count;
}

export function parseAdminStatsDateRange(searchParams: URLSearchParams): AdminStatsQueryRange {
  const today = startOfUtcDay(new Date());
  const defaultTo = today;
  const defaultFrom = addUtcDays(defaultTo, -(DEFAULT_RANGE_DAYS - 1));

  let fromDate = parseDateOnlyUtc(searchParams.get("from")) ?? defaultFrom;
  let toDate = parseDateOnlyUtc(searchParams.get("to")) ?? defaultTo;

  if (fromDate.getTime() > toDate.getTime()) {
    const swap = fromDate;
    fromDate = toDate;
    toDate = swap;
  }

  const minAllowedFrom = addUtcDays(toDate, -(MAX_RANGE_DAYS - 1));
  if (fromDate.getTime() < minAllowedFrom.getTime()) {
    fromDate = minAllowedFrom;
  }

  const from = formatDateOnlyUtc(fromDate);
  const to = formatDateOnlyUtc(toDate);
  const toExclusive = addUtcDays(toDate, 1);
  const days = Math.floor((toExclusive.getTime() - fromDate.getTime()) / 86_400_000);

  return {
    from,
    to,
    days,
    fromIso: fromDate.toISOString(),
    toExclusiveIso: toExclusive.toISOString(),
  };
}

/**
 * Overview response is intentionally chart/card-friendly:
 * - `metrics` powers KPI cards directly
 * - `statusSnapshot` provides a small breakdown list without another request
 */
export async function getAdminStatsOverview(
  supabase: AdminSupabaseServerClient,
  range: AdminStatsQueryRange
): Promise<AdminStatsOverviewResponse> {
  const { data, error } = await applySubmittedDateRange(
    supabase.from("tickets").select("submitted_at, status, assigned_staff_id"),
    range
  );

  if (error) {
    throw new Error(`Failed to load admin overview stats: ${error.message}`);
  }

  const rows = (Array.isArray(data) ? data : []) as OverviewRow[];
  const statusCounts = new Map<string, number>();

  let totalTickets = 0;
  let openInProgressTickets = 0;
  let resolvedTickets = 0;
  let unassignedTickets = 0;

  for (const row of rows) {
    totalTickets += 1;

    const status = asString(row.status) ?? "Unknown";
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);

    if (RESOLVED_STATUSES.has(status)) {
      resolvedTickets += 1;
    } else {
      openInProgressTickets += 1;
    }

    if (!asString(row.assigned_staff_id)) {
      unassignedTickets += 1;
    }
  }

  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const tomorrowStart = addUtcDays(todayStart, 1);
  const weekStart = startOfUtcIsoWeek(now);

  const createdToday = countByDateRange(rows, todayStart, tomorrowStart);
  const createdThisWeek = countByDateRange(rows, weekStart, tomorrowStart);

  return {
    dateRange: toPublicDateRange(range),
    metrics: {
      totalTickets,
      openInProgressTickets,
      resolvedTickets,
      unassignedTickets,
      createdToday,
      createdThisWeek,
    },
    statusSnapshot: buildKnownValueBreakdown(TICKET_STATUSES, statusCounts, totalTickets),
  };
}

/**
 * Trend response returns a dense daily series with zero-filled days so any chart
 * renderer can plot a stable x-axis without client-side preprocessing.
 */
export async function getAdminTicketTrends(
  supabase: AdminSupabaseServerClient,
  range: AdminStatsQueryRange
): Promise<AdminTicketsTrendsResponse> {
  const { data, error } = await applySubmittedDateRange(
    supabase.from("tickets").select("submitted_at"),
    range
  );

  if (error) {
    throw new Error(`Failed to load ticket trends: ${error.message}`);
  }

  const rows = (Array.isArray(data) ? data : []) as TrendsRow[];
  const countsByDate = new Map<string, number>();

  for (const row of rows) {
    const dateKey = toUtcDateKey(asString(row.submitted_at));
    if (!dateKey) continue;
    countsByDate.set(dateKey, (countsByDate.get(dateKey) ?? 0) + 1);
  }

  const series: AdminTicketTrendPoint[] = [];
  let totalTickets = 0;

  let cursor = parseDateOnlyUtc(range.from);
  const end = parseDateOnlyUtc(range.to);

  if (!cursor || !end) {
    return {
      dateRange: toPublicDateRange(range),
      granularity: "day",
      totalTickets: 0,
      series: [],
    };
  }

  while (cursor.getTime() <= end.getTime()) {
    const dateKey = formatDateOnlyUtc(cursor);
    const count = countsByDate.get(dateKey) ?? 0;
    totalTickets += count;

    series.push({
      date: dateKey,
      label: UTC_DATE_LABEL_FORMATTER.format(cursor),
      count,
    });

    cursor = addUtcDays(cursor, 1);
  }

  return {
    dateRange: toPublicDateRange(range),
    granularity: "day",
    totalTickets,
    series,
  };
}

/**
 * Breakdown response groups ticket counts for charting. Percentages are precomputed
 * against `totalTickets` so the UI can render pie/bar summaries without math.
 */
export async function getAdminTicketBreakdowns(
  supabase: AdminSupabaseServerClient,
  range: AdminStatsQueryRange
): Promise<AdminStatsBreakdownsResponse> {
  const { data, error } = await applySubmittedDateRange(
    supabase
      .from("tickets")
      .select(
        `
          status,
          priority,
          sentiment,
          category:complaint_categories!tickets_category_id_fkey (id, category_name)
        `
      ),
    range
  );

  if (error) {
    throw new Error(`Failed to load ticket breakdowns: ${error.message}`);
  }

  const rows = (Array.isArray(data) ? data : []) as BreakdownRow[];
  const totalTickets = rows.length;

  const statusCounts = new Map<string, number>();
  const priorityCounts = new Map<string, number>();
  const sentimentCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();

  for (const row of rows) {
    const status = asString(row.status) ?? "Unknown";
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);

    const priority = asString(row.priority) ?? "Unknown";
    priorityCounts.set(priority, (priorityCounts.get(priority) ?? 0) + 1);

    const sentiment = asString(row.sentiment) ?? "Not Analyzed";
    sentimentCounts.set(sentiment, (sentimentCounts.get(sentiment) ?? 0) + 1);

    const category = firstRow(row.category);
    const categoryLabel = asString(category?.category_name) ?? "Uncategorized";
    categoryCounts.set(categoryLabel, (categoryCounts.get(categoryLabel) ?? 0) + 1);
  }

  return {
    dateRange: toPublicDateRange(range),
    totalTickets,
    breakdowns: {
      status: buildKnownValueBreakdown(TICKET_STATUSES, statusCounts, totalTickets),
      priority: buildKnownValueBreakdown(TICKET_PRIORITIES, priorityCounts, totalTickets),
      category: buildMapBreakdown(categoryCounts, totalTickets),
      sentiment: buildKnownValueBreakdown(
        [...TICKET_SENTIMENTS, "Not Analyzed"],
        sentimentCounts,
        totalTickets
      ),
    },
  };
}
