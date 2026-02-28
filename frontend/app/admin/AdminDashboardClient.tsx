"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import AdminNav from "@/app/admin/AdminNav";
import { AdminChartCard } from "@/components/admin/AdminCharts";
import type {
  AdminCreateStaffAccountResponse,
  AdminStatsOverviewResponse,
} from "@/types/admin-stats";

import styles from "./admin.module.css";

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

export default function AdminDashboardClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const [overview, setOverview] = useState<AdminStatsOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");

  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<AdminCreateStaffAccountResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const qs = searchParams.toString();
        const response = await fetch(`/api/admin/stats/overview${qs ? `?${qs}` : ""}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(await readApiError(response));
        }

        const payload = (await response.json()) as AdminStatsOverviewResponse;
        setOverview(payload);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load dashboard metrics.");
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
    setDraftFrom(urlFrom ?? overview?.dateRange.from ?? "");
    setDraftTo(urlTo ?? overview?.dateRange.to ?? "");
  }, [searchKey, searchParams, overview?.dateRange.from, overview?.dateRange.to]);

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

  async function handleCreateStaffAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get("email") ?? "").trim(),
      firstName: String(form.get("firstName") ?? "").trim(),
      lastName: String(form.get("lastName") ?? "").trim(),
      temporaryPassword: String(form.get("temporaryPassword") ?? "").trim(),
    };

    setCreateSubmitting(true);
    setCreateError(null);
    setCreateResult(null);

    try {
      const response = await fetch("/api/admin/staff-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const result = (await response.json()) as AdminCreateStaffAccountResponse;
      setCreateResult(result);
      event.currentTarget.reset();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create Staff account.");
    } finally {
      setCreateSubmitting(false);
    }
  }

  const metrics = overview?.metrics;

  return (
    <main className={styles.page}>
      <section className={styles.headerCard}>
        <div className={styles.headerTop}>
          <div className={styles.titleWrap}>
            <h1 className={styles.title}>Admin Dashboard</h1>
            <p className={styles.subtitle}>
              Operational overview for ticket volume and queue health. Date filter defaults to the last 30
              days and powers the metrics on this page.
            </p>
            {overview ? (
              <p className={styles.metaText}>
                Showing {overview.dateRange.from} to {overview.dateRange.to} ({overview.dateRange.days} days)
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
              updateDateQuery({
                from: draftFrom || null,
                to: draftTo || null,
              });
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

      {loading && <p className={styles.stateText}>Loading dashboard metrics...</p>}
      {!loading && error && <p className={styles.errorText}>{error}</p>}

      {!loading && !error && metrics ? (
        <section className={styles.kpiGrid} aria-label="Admin ticket KPIs">
          <article className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Total Tickets</span>
            <strong className={styles.kpiValue}>{metrics.totalTickets.toLocaleString()}</strong>
            <span className={styles.kpiHint}>Submitted in selected range</span>
          </article>
          <article className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Open / In Progress</span>
            <strong className={styles.kpiValue}>{metrics.openInProgressTickets.toLocaleString()}</strong>
            <span className={styles.kpiHint}>Excludes Resolved and Closed</span>
          </article>
          <article className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Resolved / Closed</span>
            <strong className={styles.kpiValue}>{metrics.resolvedTickets.toLocaleString()}</strong>
            <span className={styles.kpiHint}>Completed tickets in range</span>
          </article>
          <article className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Unassigned</span>
            <strong className={styles.kpiValue}>{metrics.unassignedTickets.toLocaleString()}</strong>
            <span className={styles.kpiHint}>No assigned staff member</span>
          </article>
          <article className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Created Today</span>
            <strong className={styles.kpiValue}>{metrics.createdToday.toLocaleString()}</strong>
            <span className={styles.kpiHint}>Today, within selected range</span>
          </article>
          <article className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Created This Week</span>
            <strong className={styles.kpiValue}>{metrics.createdThisWeek.toLocaleString()}</strong>
            <span className={styles.kpiHint}>Current ISO week, within selected range</span>
          </article>
        </section>
      ) : null}

      {!loading && !error && overview && overview.metrics.totalTickets === 0 ? (
        <div className={styles.emptyPanel}>
          <p className={styles.stateText}>
            No tickets were submitted in the selected date range. KPI cards remain available and charts show
            empty-state messaging.
          </p>
        </div>
      ) : null}

      <section className={styles.contentGrid}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Status Snapshot</h2>
            <p className={styles.cardSubtitle}>
              Quick distribution of ticket statuses for the current filter. Open the statistics page for full
              chart breakdowns.
            </p>
          </div>

          {overview ? (
            <AdminChartCard
              title="Status Distribution"
              subtitle="Current filtered range"
              chart={{
                kind: "bars",
                data: overview.statusSnapshot.map((item) => ({
                  key: item.key,
                  label: item.label,
                  value: item.count,
                  percentage: item.percentage,
                })),
                emptyLabel: "No status data for the selected range.",
              }}
            />
          ) : (
            <p className={styles.stateText}>Load metrics to view the status snapshot.</p>
          )}

          <div className={styles.inlineRow}>
            <p className={styles.metaText}>Need deeper charts?</p>
            <Link href="/admin/statistics" className={styles.footerLink}>
              Open statistics page
            </Link>
          </div>
        </div>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Create Staff Account</h2>
            <p className={styles.cardSubtitle}>
              Staff provisioning is handled here by Admins. Public registration remains for customer accounts.
            </p>
          </div>

          <form className={styles.formGrid} onSubmit={handleCreateStaffAccount}>
            <label className={styles.field} style={{ gridColumn: "1 / -1" }}>
              <span className={styles.fieldLabel}>Staff email</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className={styles.input}
                placeholder="staff.member@example.com"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>First name (optional)</span>
              <input name="firstName" type="text" autoComplete="given-name" className={styles.input} />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Last name (optional)</span>
              <input name="lastName" type="text" autoComplete="family-name" className={styles.input} />
            </label>

            <label className={styles.field} style={{ gridColumn: "1 / -1" }}>
              <span className={styles.fieldLabel}>Temporary password (optional)</span>
              <input
                name="temporaryPassword"
                type="text"
                className={styles.input}
                placeholder="Leave blank to auto-generate a strong temporary password"
              />
            </label>

            <div className={styles.formActions} style={{ gridColumn: "1 / -1" }}>
              <button type="submit" className={styles.buttonPrimary} disabled={createSubmitting}>
                {createSubmitting ? "Creating..." : "Create Staff Account"}
              </button>
              <Link href="/register" className={styles.footerLink}>
                Customer registration page
              </Link>
            </div>
          </form>

          {createError ? <p className={styles.errorText}>{createError}</p> : null}

          {createResult ? (
            <div className={styles.infoPanel}>
              <p className={styles.successText}>{createResult.message}</p>
              <p className={styles.metaText}>
                Account: {createResult.account.email} ({createResult.account.role})
              </p>
              <p className={styles.metaText}>Temporary password (displayed once in UI):</p>
              <pre className={styles.codeValue}>{createResult.account.temporaryPassword}</pre>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
