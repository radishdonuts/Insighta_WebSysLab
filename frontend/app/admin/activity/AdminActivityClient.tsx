"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import AdminNav from "@/app/admin/AdminNav";
import type { AdminActivityLogItem, AdminActivityLogsResponse } from "@/types/admin-ops";

import styles from "../admin.module.css";

type ApiErrorPayload = { error?: string; message?: string };

type FilterDraft = {
  action: string;
  entityType: string;
  user: string;
  from: string;
  to: string;
  pageSize: string;
};

function formatDateTime(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function describeUser(row: AdminActivityLogItem["user"]) {
  if (!row) return "System";
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
  if (name && row.email) return `${name} (${row.email})`;
  return name || row.email || row.id;
}

async function readApiError(response: Response) {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    return payload.message || payload.error || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

function buildDraft(searchParams: URLSearchParams): FilterDraft {
  return {
    action: searchParams.get("action") ?? "",
    entityType: searchParams.get("entityType") ?? "",
    user: searchParams.get("user") ?? "",
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
    pageSize: searchParams.get("pageSize") ?? "25",
  };
}

export default function AdminActivityClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const [draft, setDraft] = useState<FilterDraft>(() => buildDraft(new URLSearchParams()));
  const [response, setResponse] = useState<AdminActivityLogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(buildDraft(new URLSearchParams(searchParams.toString())));
  }, [searchKey, searchParams]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadActivityLogs() {
      setLoading(true);
      setError(null);

      try {
        const qs = searchParams.toString();
        const result = await fetch(`/api/admin/activity-logs${qs ? `?${qs}` : ""}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!result.ok) {
          throw new Error(await readApiError(result));
        }

        const payload = (await result.json()) as AdminActivityLogsResponse;
        setResponse(payload);
      } catch (loadError) {
        if ((loadError as Error).name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load activity logs.");
      } finally {
        setLoading(false);
      }
    }

    void loadActivityLogs();
    return () => controller.abort();
  }, [searchKey, searchParams]);

  function updateQuery(mutator: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutator(params);
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname);
  }

  function applyFilters() {
    updateQuery((params) => {
      const mappings: Array<[keyof FilterDraft, string]> = [
        ["action", "action"],
        ["entityType", "entityType"],
        ["user", "user"],
        ["from", "from"],
        ["to", "to"],
        ["pageSize", "pageSize"],
      ];

      for (const [draftKey, paramKey] of mappings) {
        const value = draft[draftKey].trim();
        if (value) params.set(paramKey, value);
        else params.delete(paramKey);
      }

      params.delete("page");
    });
  }

  function resetFilters() {
    setDraft({
      action: "",
      entityType: "",
      user: "",
      from: "",
      to: "",
      pageSize: "25",
    });
    router.replace(pathname);
  }

  function goToPage(nextPage: number) {
    updateQuery((params) => {
      if (nextPage <= 1) params.delete("page");
      else params.set("page", String(nextPage));
    });
  }

  const rows = response?.data ?? [];
  const pagination = response?.pagination;
  const currentPage = pagination?.page ?? 1;
  const totalPages = pagination?.totalPages ?? 1;
  const total = pagination?.total ?? 0;

  return (
    <main className={styles.page}>
      <section className={styles.headerCard}>
        <div className={styles.headerTop}>
          <div className={styles.titleWrap}>
            <h1 className={styles.title}>System Activity</h1>
            <p className={styles.subtitle}>
              Review operational activity events across the app. Filters support exact action/entity type and
              user/date narrowing for audits.
            </p>
            {pagination ? (
              <p className={styles.metaText}>
                {total.toLocaleString()} total log entries. Page {currentPage} of {totalPages}.
              </p>
            ) : null}
          </div>

          <AdminNav />
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Filters</h2>
          <p className={styles.cardSubtitle}>
            Action and entity type filters are exact match. User filter searches email/first/last name and also
            accepts a user UUID.
          </p>
        </div>

        <form
          className={styles.formGrid}
          onSubmit={(event) => {
            event.preventDefault();
            applyFilters();
          }}
        >
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Action</span>
            <input
              type="text"
              className={styles.input}
              value={draft.action}
              onChange={(event) => setDraft((prev) => ({ ...prev, action: event.target.value }))}
              placeholder="e.g. admin_category_created"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Entity type</span>
            <input
              type="text"
              className={styles.input}
              value={draft.entityType}
              onChange={(event) => setDraft((prev) => ({ ...prev, entityType: event.target.value }))}
              placeholder="e.g. complaint_category"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>User</span>
            <input
              type="text"
              className={styles.input}
              value={draft.user}
              onChange={(event) => setDraft((prev) => ({ ...prev, user: event.target.value }))}
              placeholder="email, name, or UUID"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Page size</span>
            <select
              className={styles.select}
              value={draft.pageSize}
              onChange={(event) => setDraft((prev) => ({ ...prev, pageSize: event.target.value }))}
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>From date</span>
            <input
              type="date"
              className={styles.input}
              value={draft.from}
              onChange={(event) => setDraft((prev) => ({ ...prev, from: event.target.value }))}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>To date</span>
            <input
              type="date"
              className={styles.input}
              value={draft.to}
              onChange={(event) => setDraft((prev) => ({ ...prev, to: event.target.value }))}
            />
          </label>

          <div className={styles.formActions} style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className={styles.buttonPrimary}>
              Apply Filters
            </button>
            <button type="button" className={styles.buttonSecondary} onClick={resetFilters}>
              Reset
            </button>
          </div>
        </form>
      </section>

      {loading ? <p className={styles.stateText}>Loading activity logs...</p> : null}
      {!loading && error ? <p className={styles.errorText}>{error}</p> : null}

      {!loading && !error ? (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Activity Log</h2>
            <p className={styles.cardSubtitle}>
              Results exclude IP addresses by default to reduce exposure of sensitive metadata.
            </p>
          </div>

          {rows.length === 0 ? (
            <div className={styles.emptyPanel}>
              <p className={styles.stateText}>No activity logs matched the current filters.</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>User</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className={styles.tableCellMuted}>
                        <div className={styles.cellStack}>
                          <span>{formatDateTime(row.timestamp)}</span>
                          <code className={styles.codeInline}>{row.id}</code>
                        </div>
                      </td>
                      <td>
                        <code className={styles.codeInline}>{row.action}</code>
                      </td>
                      <td>
                        <div className={styles.cellStack}>
                          <span>{row.entityType}</span>
                          {row.entityId ? (
                            <code className={styles.codeInline}>{row.entityId}</code>
                          ) : (
                            <span className={styles.tableCellMuted}>No entity ID</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className={styles.cellStack}>
                          <span>{describeUser(row.user)}</span>
                          {row.user?.id ? <code className={styles.codeInline}>{row.user.id}</code> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pagination ? (
            <div className={styles.paginationBar}>
              <p className={styles.metaText}>
                Showing page {pagination.page} of {pagination.totalPages} ({pagination.total.toLocaleString()}{" "}
                records)
              </p>
              <div className={styles.rowActions}>
                <button
                  type="button"
                  className={styles.buttonSecondary}
                  onClick={() => goToPage(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className={styles.buttonSecondary}
                  onClick={() => goToPage(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
