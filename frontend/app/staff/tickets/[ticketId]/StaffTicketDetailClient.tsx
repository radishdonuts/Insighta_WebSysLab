"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { StaffTicketDetailResponse } from "@/types/staff-tickets";
import { TICKET_STATUSES } from "@/types/tickets";

import styles from "../../staff-workspace.module.css";

type ApiErrorPayload = { error?: string; message?: string };

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
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

export default function StaffTicketDetailClient({ ticketId }: { ticketId: string }) {
  const [data, setData] = useState<StaffTicketDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState("");
  const [remarks, setRemarks] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function loadDetail() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/staff/tickets/${ticketId}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = (await response.json()) as StaffTicketDetailResponse;
      setData(payload);
      setStatusDraft(payload.ticket.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ticket.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDetail();
  }, [ticketId]);

  async function handleSelfAssign() {
    setAssigning(true);
    setActionMessage(null);
    setActionError(null);
    try {
      const response = await fetch(`/api/staff/tickets/${ticketId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "self_assign" }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      const payload = (await response.json()) as { message?: string };
      setActionMessage(payload.message ?? "Ticket assignment updated.");
      await loadDetail();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to assign ticket.");
    } finally {
      setAssigning(false);
    }
  }

  async function handleStatusSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setActionMessage(null);
    setActionError(null);
    try {
      const response = await fetch(`/api/staff/tickets/${ticketId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: statusDraft,
          remarks: remarks.trim() || undefined,
        }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      const payload = (await response.json()) as { message?: string };
      setActionMessage(payload.message ?? "Ticket status updated.");
      setRemarks("");
      await loadDetail();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update ticket status.");
    } finally {
      setSaving(false);
    }
  }

  const ticket = data?.ticket;

  return (
    <main className={styles.page}>
      <section className={styles.headerCard}>
        <Link href="/staff" className={styles.textLink}>Back to Staff Queue</Link>
        <h1 className={styles.title}>Ticket Detail</h1>
        <p className={styles.subtitle}>Review ticket context and perform staff actions.</p>
      </section>

      {loading && <section className={styles.card}><p className={styles.stateText}>Loading ticket...</p></section>}
      {!loading && error && <section className={styles.card}><p className={styles.errorText}>{error}</p></section>}

      {!loading && !error && ticket && (
        <>
          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>{ticket.ticketNumber}</h2>
                <p className={styles.metaText}>Submitted {formatDateTime(ticket.submittedAt)}</p>
              </div>
              <div className={styles.badgeRow}>
                <span className={statusBadge(ticket.status)}>{ticket.status}</span>
                <span className={priorityBadge(ticket.priority)}>{ticket.priority}</span>
              </div>
            </div>

            <div className={styles.gridTwo}>
              <div className={styles.infoPanel}>
                <h3 className={styles.panelTitle}>Ticket Details</h3>
                <dl className={styles.keyValueList}>
                  <div><dt>Type</dt><dd>{ticket.ticketType}</dd></div>
                  <div><dt>Category</dt><dd>{ticket.category?.name ?? "-"}</dd></div>
                  <div><dt>Submitter Type</dt><dd>{ticket.submitterType}</dd></div>
                  <div><dt>Submitter</dt><dd>{ticket.submitter?.displayName ?? ticket.guestEmail ?? "-"}</dd></div>
                  <div><dt>Assigned Staff</dt><dd>{ticket.assignedStaff?.displayName ?? "Unassigned"}</dd></div>
                  <div><dt>Last Updated</dt><dd>{formatDateTime(ticket.lastUpdatedAt)}</dd></div>
                </dl>
              </div>

              <div className={styles.infoPanel}>
                <h3 className={styles.panelTitle}>NLP Fields</h3>
                <dl className={styles.keyValueList}>
                  <div><dt>Sentiment</dt><dd>{ticket.sentiment ?? "-"}</dd></div>
                  <div><dt>Detected Intent</dt><dd>{ticket.detectedIntent ?? "-"}</dd></div>
                  <div><dt>Issue Type</dt><dd>{ticket.issueType ?? "-"}</dd></div>
                </dl>
              </div>
            </div>

            <div className={styles.infoPanel}>
              <h3 className={styles.panelTitle}>Description</h3>
              <p className={styles.preWrapText}>{ticket.description}</p>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Staff Actions</h2>
            </div>
            {actionMessage && <p className={styles.successText}>{actionMessage}</p>}
            {actionError && <p className={styles.errorText}>{actionError}</p>}
            <div className={styles.gridTwo}>
              <div className={styles.infoPanel}>
                <h3 className={styles.panelTitle}>Assignment</h3>
                <p className={styles.metaText}>Current: {ticket.assignedStaff?.displayName ?? "Unassigned"}</p>
                <button type="button" className={styles.buttonPrimary} onClick={handleSelfAssign} disabled={assigning}>
                  {assigning ? "Assigning..." : "Assign To Me"}
                </button>
              </div>

              <form className={styles.infoPanel} onSubmit={handleStatusSubmit}>
                <h3 className={styles.panelTitle}>Update Status</h3>
                <label className={styles.field}>
                  <span>Status</span>
                  <select className={styles.select} value={statusDraft} onChange={(e) => setStatusDraft(e.target.value)}>
                    {TICKET_STATUSES.map((status: string) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Remarks (optional)</span>
                  <textarea
                    className={styles.textarea}
                    rows={3}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Add context for the status update"
                  />
                </label>
                <button type="submit" className={styles.buttonPrimary} disabled={saving}>
                  {saving ? "Saving..." : "Save Status"}
                </button>
              </form>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.sectionHeader}><h2 className={styles.sectionTitle}>Attachments</h2></div>
            {ticket.attachments.length === 0 ? (
              <p className={styles.stateText}>No attachments available.</p>
            ) : (
              <ul className={styles.list}>
                {ticket.attachments.map((item) => (
                  <li key={item.id} className={styles.listItem}>
                    <div className={styles.cellStack}>
                      <strong>{item.fileName}</strong>
                      <span className={styles.mutedText}>{item.fileType ?? "Unknown type"}</span>
                      <span className={styles.bodyText}>{item.filePath}</span>
                      {item.signedUrl ? (
                        <a href={item.signedUrl} target="_blank" rel="noreferrer" className={styles.textLink}>
                          Open attachment
                        </a>
                      ) : null}
                      {item.signedUrl && (item.fileType ?? "").startsWith("image/") ? (
                        <img
                          src={item.signedUrl}
                          alt={item.fileName}
                          style={{
                            marginTop: 8,
                            maxWidth: 320,
                            width: "100%",
                            borderRadius: 10,
                            border: "1px solid rgba(148, 163, 184, 0.35)",
                          }}
                        />
                      ) : null}
                    </div>
                    <span className={styles.metaText}>{formatDateTime(item.uploadedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.card}>
            <div className={styles.sectionHeader}><h2 className={styles.sectionTitle}>Status History</h2></div>
            {ticket.statusHistory.length === 0 ? (
              <p className={styles.stateText}>No status history entries yet.</p>
            ) : (
              <ol className={styles.timeline}>
                {ticket.statusHistory.map((entry) => (
                  <li key={entry.id} className={styles.timelineItem}>
                    <div className={styles.timelineDot} aria-hidden="true" />
                    <div className={styles.timelineContent}>
                      <div className={styles.timelineHeader}>
                        <strong>{entry.oldStatus} to {entry.newStatus}</strong>
                        <span className={styles.metaText}>{formatDateTime(entry.changedAt)}</span>
                      </div>
                      <p className={styles.mutedText}>By {entry.changedBy?.displayName ?? "Unknown Staff"}</p>
                      {entry.remarks && <p className={styles.bodyText}>{entry.remarks}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className={styles.card}>
            <div className={styles.sectionHeader}><h2 className={styles.sectionTitle}>Feedback</h2></div>
            {!ticket.feedback ? (
              <p className={styles.stateText}>No feedback submitted for this ticket.</p>
            ) : (
              <div className={styles.infoPanel}>
                <dl className={styles.keyValueList}>
                  <div><dt>Rating</dt><dd>{ticket.feedback.rating} / 5</dd></div>
                  <div><dt>Submitted</dt><dd>{formatDateTime(ticket.feedback.submittedAt)}</dd></div>
                  <div>
                    <dt>Submitter</dt>
                    <dd>{ticket.feedback.submittedBy?.displayName ?? ticket.feedback.guestEmail ?? ticket.feedback.submitterType}</dd>
                  </div>
                  <div><dt>Submitter Type</dt><dd>{ticket.feedback.submitterType}</dd></div>
                </dl>
                <div className={styles.infoPanel}>
                  <h3 className={styles.panelTitle}>Comment</h3>
                  <p className={styles.preWrapText}>{ticket.feedback.comment ?? "No comment provided."}</p>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
