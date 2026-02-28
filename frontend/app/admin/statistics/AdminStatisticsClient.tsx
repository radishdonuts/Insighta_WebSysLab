"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import AdminNav from "@/app/admin/AdminNav";
import styles from "@/app/admin/admin.module.css";
import { AdminChartCard } from "@/components/admin/AdminCharts";
import type {
  AdminStatsBreakdownsResponse,
  AdminTicketsTrendsResponse,
} from "@/types/admin-stats";

type ApiErrorPayload = { error?: string; message?: string };

function formatDateKey(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

function getPresetDateRange(days: number) {
  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (Math.max(days, 1) - 1));

  return {
    from: formatDateKey(start),
    to: formatDateKey(end),
  };
}

async function readApiError(response: Response) {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    return payload.message || payload.error || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export default function AdminStatisticsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const [trends, setTrends] = useState<AdminTicketsTrendsResponse | null>(null);
  const [breakdowns, setBreakdowns] = useState<AdminStatsBreakdownsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const qs = searchParams.toString();
        const suffix = qs ? `?${qs}` : "";
        const [trendsResponse, breakdownsResponse] = await Promise.all([
          fetch(`/api/admin/stats/tickets-trends${suffix}`, { cache: "no-store", signal: controller.signal }),
          fetch(`/api/admin/stats/breakdowns${suffix}`, { cache: "no-store", signal: controller.signal }),
        ]);

        if (!trendsResponse.ok) {
          throw new Error(await readApiError(trendsResponse));
        }

        if (!breakdownsResponse.ok) {
          throw new Error(await readApiError(breakdownsResponse));
        }

        const [trendsPayload, breakdownsPayload] = await Promise.all([
          trendsResponse.json() as Promise<AdminTicketsTrendsResponse>,
          breakdownsResponse.json() as Promise<AdminStatsBreakdownsResponse>,
        ]);

        setTrends(trendsPayload);
        setBreakdowns(breakdownsPayload);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load statistics.");
      } finally {
        setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [searchKey, searchParams]);

  useEffect(() => {
    const urlFrom = searchParams.get("from");
    const urlTo = searchParams.get("to");
    const fallbackFrom = breakdowns?.dateRange.from ?? trends?.dateRange.from ?? "";
    const fallbackTo = breakdowns?.dateRange.to ?? trends?.dateRange.to ?? "";

    setDraftFrom(urlFrom ?? fallbackFrom);
    setDraftTo(urlTo ?? fallbackTo);
  }, [
    searchKey,
    searchParams,
    breakdowns?.dateRange.from,
    breakdowns?.dateRange.to,
    trends?.dateRange.from,
    trends?.dateRange.to,
  ]);

  function updateDateQuery(next: { from?: string | null; to?: string | null }) {
    const params = new URLSearchParams(searchParams.toString());

    if ("from" in next) {
      if (next.from) params.set("from", next.from);
      else params.delete("from");
    }

    if ("to" in next) {
      if (next.to) params.set("to", next.to);
      else params.delete("to");
    }

    router.replace(params.size ? `${pathname}?${params.toString()}` : pathname);
  }

  function applyPreset(days: number) {
    updateDateQuery(getPresetDateRange(days));
  }

  function resetDateRange() {
    updateDateQuery({ from: null, to: null });
  }

  const lineData = (trends?.series ?? []).map((point) => ({
    key: point.date,
    label: point.label,
    value: point.count,
  }));

  const totalTickets = breakdowns?.totalTickets ?? trends?.totalTickets ?? 0;
  const dateRange = breakdowns?.dateRange ?? trends?.dateRange;

  return (
    <main className={styles.page}>
      <section className={styles.headerCard}>
        <div className={styles.headerTop}>
          <div className={styles.titleWrap}>
            <h1 className={styles.title}>Admin Statistics</h1>
            <p className={styles.subtitle}>
              API-backed summaries and charts for ticket volume and distribution by status, priority,
              category, and sentiment.
            </p>
            {dateRange ? (
              <p className={styles.metaText}>
                {totalTickets.toLocaleString()} tickets from {dateRange.from} to {dateRange.to} (
                {dateRange.days} days)
              </p>
            ) : null}
          </div>

          <AdminNav />
        </div>

        <div className={styles.toolbar}>
          <span className={styles.toolbarLabel}>Date range filter</span>
          <form
            className={styles.toolbarForm}
            onSubmit={(event) => {
              event.preventDefault();
              updateDateQuery({ from: draftFrom || null, to: draftTo || null });
            }}
          >
            <label className={styles.field}>
              <span className={styles.fieldLabel}>From</span>
              <input
                type="date"
                className={styles.input}
                value={draftFrom}
                onChange={(event) => setDraftFrom(event.target.value)}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>To</span>
              <input
                type="date"
                className={styles.input}
                value={draftTo}
                onChange={(event) => setDraftTo(event.target.value)}
              />
            </label>

            <button type="submit" className={styles.buttonPrimary}>
              Apply
            </button>
            <button type="button" className={styles.buttonSecondary} onClick={resetDateRange}>
              Reset
            </button>
          </form>

          <div className={styles.toolbarQuick}>
            <button type="button" className={styles.buttonGhost} onClick={() => applyPreset(7)}>
              Last 7 days
            </button>
            <button type="button" className={styles.buttonGhost} onClick={() => applyPreset(30)}>
              Last 30 days
            </button>
            <button type="button" className={styles.buttonGhost} onClick={() => applyPreset(90)}>
              Last 90 days
            </button>
          </div>
        </div>
      </section>

      {loading && <p className={styles.stateText}>Loading statistics...</p>}
      {!loading && error && <p className={styles.errorText}>{error}</p>}

      {!loading && !error && !trends && !breakdowns ? (
        <p className={styles.stateText}>No statistics data available.</p>
      ) : null}

      {!loading && !error && totalTickets === 0 ? (
        <div className={styles.emptyPanel}>
          <p className={styles.stateText}>
            No tickets found in the selected range. Charts remain visible with empty-state messaging.
          </p>
        </div>
      ) : null}

      <section className={styles.statsGrid}>
        <div className={styles.span2}>
          <AdminChartCard
            title="Tickets Over Time"
            subtitle="Daily ticket submissions in the selected range"
            chart={{
              kind: "line",
              data: lineData,
              emptyLabel: "No tickets were submitted during the selected period.",
            }}
          />
        </div>

        <AdminChartCard
          title="Status Distribution"
          subtitle="Ticket lifecycle stages"
          chart={{
            kind: "bars",
            data: (breakdowns?.breakdowns.status ?? []).map((item) => ({
              key: item.key,
              label: item.label,
              value: item.count,
              percentage: item.percentage,
            })),
            emptyLabel: "No status distribution data.",
          }}
        />

        <AdminChartCard
          title="Priority Distribution"
          subtitle="Urgency mix for tickets"
          chart={{
            kind: "bars",
            data: (breakdowns?.breakdowns.priority ?? []).map((item) => ({
              key: item.key,
              label: item.label,
              value: item.count,
              percentage: item.percentage,
            })),
            emptyLabel: "No priority distribution data.",
          }}
        />

        <AdminChartCard
          title="Category Distribution"
          subtitle="Top complaint categories by ticket count"
          chart={{
            kind: "bars",
            data: (breakdowns?.breakdowns.category ?? []).map((item) => ({
              key: item.key,
              label: item.label,
              value: item.count,
              percentage: item.percentage,
            })),
            emptyLabel: "No category distribution data.",
            maxItems: 12,
          }}
        />

        <AdminChartCard
          title="Sentiment Distribution"
          subtitle="NLP sentiment labels (plus not analyzed)"
          chart={{
            kind: "bars",
            data: (breakdowns?.breakdowns.sentiment ?? []).map((item) => ({
              key: item.key,
              label: item.label,
              value: item.count,
              percentage: item.percentage,
            })),
            emptyLabel: "No sentiment distribution data.",
          }}
        />
      </section>
    </main>
  );
}
