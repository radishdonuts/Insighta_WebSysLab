"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  STAFF_ASSIGNMENT_FILTERS,
  STAFF_TICKET_TABS,
  type StaffAssignmentFilter,
  type StaffCategorySummary,
  type StaffTicketQueueItem,
  type StaffTicketQueueResponse,
  type StaffTicketTab,
} from "@/types/staff-tickets";
import { TICKET_PRIORITIES, TICKET_STATUSES } from "@/types/tickets";

import styles from "./staff-workspace.module.css";

type ApiErrorPayload = { error?: string; message?: string };

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function truncate(text: string, max = 120) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}...`;
}

function badge(base: string) {
  return `${styles.badge} ${base}`;
}

function statusBadge(status: string) {
  if (status === "Resolved" || status === "Closed") return badge(styles.badgeSuccess);
  if (status === "Pending Customer Response") return badge(styles.badgeWarning);
  if (status === "In Progress") return badge(styles.badgeInfo);
  return badge(styles.badgeNeutral);
}

function priorityBadge(priority: string) {
  if (priority === "High") return badge(styles.badgeDanger);
  if (priority === "Medium") return badge(styles.badgeWarning);
  if (priority === "Low") return badge(styles.badgeSuccess);
  return badge(styles.badgeNeutral);
}

async function readApiError(response: Response) {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    return payload.message || payload.error || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export default function StaffWorkspaceClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const [data, setData] = useState<StaffTicketQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    setSearchInput(searchParams.get("q") ?? "");
  }, [searchKey, searchParams]);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const qs = searchParams.toString();
        const response = await fetch(`/api/staff/tickets${qs ? `?${qs}` : ""}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(await readApiError(response));
        }

        setData((await response.json()) as StaffTicketQueueResponse);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load tickets.");
      } finally {
        setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [searchKey, searchParams]);

  const currentTab = ((searchParams.get("tab") ?? "my") === "unassigned"
    ? "unassigned"
    : "my") as StaffTicketTab;
  const currentAssignment = (searchParams.get("assignment") ??
    (currentTab === "unassigned" ? "unassigned" : "mine")) as StaffAssignmentFilter;
  const currentStatus = searchParams.get("status") ?? "";
  const currentPriority = searchParams.get("priority") ?? "";
  const currentCategoryId = searchParams.get("categoryId") ?? "";

  const categoryOptions = useMemo(() => data?.categoryOptions ?? [], [data]);
  const pagination = data?.pagination;

  function updateQuery(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    router.replace(params.size ? `${pathname}?${params}` : pathname);
  }

  function setFilter(key: string, value: string) {
    updateQuery({ [key]: value || null, page: "1" });
  }

  function setPage(page: number) {
    updateQuery({ page: String(page) });
  }

  function setTab(tab: StaffTicketTab) {
    updateQuery({
      tab,
      assignment: tab === "unassigned" ? "unassigned" : "mine",
      page: "1",
    });
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateQuery({ q: searchInput.trim() || null, page: "1" });
  }

  return (
    <main className={styles.page}>
      <section className={styles.headerCard}>
        <h1 className={styles.title}>Staff Ticket Workspace</h1>
        <p className={styles.subtitle}>
          Queue view for triage and resolution. Filters are synced to the URL for sharing and refresh.
        </p>
      </section>

      <section className={styles.card}>
        <div className={styles.tabs} role="tablist" aria-label="Queue tabs">
          {STAFF_TICKET_TABS.map((tab) => {
            const active = currentTab === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                className={`${styles.tabButton} ${active ? styles.tabButtonActive : ""}`}
                onClick={() => setTab(tab)}
              >
                {tab === "my" ? "My Tickets" : "Unassigned"}
              </button>
            );
          })}
        </div>

        <form className={styles.filtersGrid} onSubmit={handleSearchSubmit}>
          <label className={styles.field}>
            <span>Search</span>
            <div className={styles.inlineField}>
              <input
                type="search"
                className={styles.input}
                placeholder="Ticket number or description"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              <button type="submit" className={styles.buttonPrimary}>
                Apply
              </button>
            </div>
          </label>

          <label className={styles.field}>
            <span>Status</span>
            <select className={styles.select} value={currentStatus} onChange={(e) => setFilter("status", e.target.value)}>
              <option value="">All</option>
              {TICKET_STATUSES.map((status: string) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Priority</span>
            <select className={styles.select} value={currentPriority} onChange={(e) => setFilter("priority", e.target.value)}>
              <option value="">All</option>
              {TICKET_PRIORITIES.map((priority: string) => (
                <option key={priority} value={priority}>{priority}</option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Category</span>
            <select className={styles.select} value={currentCategoryId} onChange={(e) => setFilter("categoryId", e.target.value)}>
              <option value="">All</option>
              {categoryOptions.map((category: StaffCategorySummary) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Assignment</span>
            <select className={styles.select} value={currentAssignment} onChange={(e) => setFilter("assignment", e.target.value)}>
              {STAFF_ASSIGNMENT_FILTERS.map((assignment) => (
                <option key={assignment} value={assignment}>
                  {assignment === "all"
                    ? "All"
                    : assignment === "mine"
                      ? "Mine"
                      : assignment === "assigned"
                        ? "Assigned"
                        : "Unassigned"}
                </option>
              ))}
            </select>
          </label>
        </form>
      </section>

      <section className={styles.card}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Ticket Queue</h2>
          {pagination ? (
            <p className={styles.metaText}>
              {pagination.total} tickets • Page {pagination.page} of {pagination.totalPages}
            </p>
          ) : null}
        </div>

        {loading && <p className={styles.stateText}>Loading tickets...</p>}
        {!loading && error && <p className={styles.errorText}>{error}</p>}
        {!loading && !error && data && data.data.length === 0 && (
          <p className={styles.stateText}>No tickets match the current filters.</p>
        )}

        {!loading && !error && data && data.data.length > 0 && (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Category</th>
                    <th>Assignee</th>
                    <th>Updated</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((ticket: StaffTicketQueueItem) => (
                    <tr key={ticket.id}>
                      <td>
                        <div className={styles.cellStack}>
                          <strong>{ticket.ticketNumber}</strong>
                          <span className={styles.mutedText}>{ticket.submitterType}</span>
                          <span className={styles.bodyText}>{truncate(ticket.description)}</span>
                        </div>
                      </td>
                      <td><span className={statusBadge(ticket.status)}>{ticket.status}</span></td>
                      <td><span className={priorityBadge(ticket.priority)}>{ticket.priority}</span></td>
                      <td>{ticket.category?.name ?? "-"}</td>
                      <td>{ticket.assignedStaff?.displayName ?? "Unassigned"}</td>
                      <td>{formatDateTime(ticket.lastUpdatedAt)}</td>
                      <td>
                        <Link href={`/staff/tickets/${ticket.id}`} className={styles.linkButton}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination && (
              <div className={styles.paginationBar}>
                <button
                  type="button"
                  className={styles.buttonSecondary}
                  onClick={() => setPage(Math.max(1, pagination.page - 1))}
                  disabled={pagination.page <= 1}
                >
                  Previous
                </button>
                <span className={styles.metaText}>
                  Showing {(pagination.page - 1) * pagination.pageSize + 1}-
                  {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}
                </span>
                <button
                  type="button"
                  className={styles.buttonSecondary}
                  onClick={() => setPage(Math.min(pagination.totalPages, pagination.page + 1))}
                  disabled={pagination.page >= pagination.totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
