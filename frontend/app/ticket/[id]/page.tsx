"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { FeedbackForm } from "@/components/FeedbackForm";

type ApiTicket = {
  id?: unknown;
  ticket_id?: unknown;
  reference?: unknown;
  ticket_number?: unknown;
  ticketType?: unknown;
  ticket_type?: unknown;
  status?: unknown;
  priority?: unknown;
  categoryName?: unknown;
  category_name?: unknown;
  description?: unknown;
  submittedAt?: unknown;
  submitted_at?: unknown;
  lastUpdatedAt?: unknown;
  last_updated_at?: unknown;
  guest_tracking_number?: unknown;
};

type TicketResponse = {
  ok?: boolean;
  message?: string;
  ticket?: ApiTicket;
};

type TicketDetail = {
  id: string;
  reference: string;
  ticketType: string;
  status: string;
  priority: string;
  category: string;
  description: string;
  submittedAt: string;
  lastUpdatedAt: string;
  guestTrackingNumber: string;
};

type FeedbackPayload = {
  feedback?: {
    id?: unknown;
    rating?: unknown;
    comment?: unknown;
    submitted_at?: unknown;
  } | null;
  error?: string;
};

const STEPS = ["Received", "In Review", "In Progress", "Resolved"] as const;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toTicketDetail(input: ApiTicket, fallbackId: string): TicketDetail {
  return {
    id: asString(input.id) || asString(input.ticket_id) || fallbackId,
    reference: asString(input.reference) || asString(input.ticket_number),
    ticketType: asString(input.ticketType) || asString(input.ticket_type),
    status: asString(input.status),
    priority: asString(input.priority),
    category: asString(input.categoryName) || asString(input.category_name),
    description: asString(input.description),
    submittedAt: asString(input.submittedAt) || asString(input.submitted_at),
    lastUpdatedAt: asString(input.lastUpdatedAt) || asString(input.last_updated_at),
    guestTrackingNumber: asString(input.guest_tracking_number),
  };
}

function deriveStepIndex(status: string): number {
  const normalized = status.toLowerCase();
  if (!normalized) return 0;
  if (normalized.includes("resolved") || normalized.includes("closed")) return 3;
  if (normalized.includes("progress") || normalized.includes("pending")) return 2;
  if (normalized.includes("review")) return 1;
  return 0;
}

function formatDate(value: string): string {
  if (!value) return "";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function isResolvedLike(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === "resolved" || normalized === "closed";
}

export default function TicketDetailPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<TicketDetailFallback id={params.id} />}>
      <TicketDetailPageContent params={params} />
    </Suspense>
  );
}

function TicketDetailPageContent({ params }: { params: { id: string } }) {
  const searchParams = useSearchParams();
  const token = asString(searchParams.get("token"));

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackInitial, setFeedbackInitial] = useState<{ rating: number; comment: string } | undefined>();

  useEffect(() => {
    let cancelled = false;

    async function loadTicket() {
      setLoading(true);
      setError(null);

      try {
        const primaryEndpoint = token
          ? `/api/ticket/lookup?token=${encodeURIComponent(token)}`
          : `/api/ticket/${encodeURIComponent(params.id)}`;

        const primaryResponse = await fetch(primaryEndpoint, { cache: "no-store" });
        const primaryPayload = (await primaryResponse.json()) as TicketResponse;

        if (primaryResponse.ok && primaryPayload.ok !== false && primaryPayload.ticket) {
          if (!cancelled) {
            setTicket(toTicketDetail(primaryPayload.ticket, params.id));
          }
          return;
        }

        if (token) {
          const fallbackResponse = await fetch(`/api/ticket/${encodeURIComponent(params.id)}`, { cache: "no-store" });
          const fallbackPayload = (await fallbackResponse.json()) as TicketResponse;

          if (fallbackResponse.ok && fallbackPayload.ok !== false && fallbackPayload.ticket) {
            if (!cancelled) {
              setTicket(toTicketDetail(fallbackPayload.ticket, params.id));
            }
            return;
          }
        }

        throw new Error(asString(primaryPayload.message) || "Failed to load ticket.");
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load ticket.");
          setTicket(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadTicket();

    return () => {
      cancelled = true;
    };
  }, [params.id, token]);

  useEffect(() => {
    let cancelled = false;

    async function loadFeedback() {
      if (!ticket) {
        setFeedbackInitial(undefined);
        return;
      }

      const query = token ? `?token=${encodeURIComponent(token)}` : "";
      try {
        const response = await fetch(`/api/ticket/${encodeURIComponent(params.id)}/feedback${query}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          if (!cancelled) setFeedbackInitial(undefined);
          return;
        }

        const payload = (await response.json()) as FeedbackPayload;
        const feedback = payload.feedback;
        const rating = typeof feedback?.rating === "number" ? feedback.rating : 0;
        const comment = asString(feedback?.comment);

        if (!cancelled) {
          setFeedbackInitial(rating >= 1 && rating <= 5 ? { rating, comment } : undefined);
        }
      } catch {
        if (!cancelled) setFeedbackInitial(undefined);
      }
    }

    void loadFeedback();
    return () => {
      cancelled = true;
    };
  }, [params.id, ticket, token]);

  async function submitFeedback(data: { rating: number; comment: string }) {
    const query = token ? `?token=${encodeURIComponent(token)}` : "";
    const response = await fetch(`/api/ticket/${encodeURIComponent(params.id)}/feedback${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: data.rating, comment: data.comment }),
    });

    const payload = (await response.json()) as FeedbackPayload;
    if (!response.ok) {
      throw new Error(asString(payload.error) || "Failed to submit feedback.");
    }

    setFeedbackInitial({ rating: data.rating, comment: data.comment });
  }

  const currentStep = deriveStepIndex(ticket?.status ?? "");
  const displayIdentifier = token || ticket?.guestTrackingNumber || ticket?.reference || ticket?.id || params.id;
  const displayLabel = token ? "Tracking" : "Ticket";
  const priorityColors: Record<string, { bg: string; color: string; border: string }> = {
    High: { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
    Medium: { bg: "#fffbeb", color: "#b45309", border: "#fde68a" },
    Low: { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
  };
  const priorityStyle = priorityColors[ticket?.priority ?? ""] ?? priorityColors.Low;

  return (
    <main style={{ background: "var(--surface)", minHeight: "100vh", padding: "48px 1rem" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <h1
          style={{
            fontSize: "1.8rem",
            fontWeight: 800,
            marginBottom: "1.5rem",
            color: "var(--text)",
          }}
        >
          {displayLabel}: {displayIdentifier}
        </h1>

        <section
          style={{
            background: "var(--bg)",
            border: "1px solid #e5e7eb",
            borderRadius: "1rem",
            padding: "2rem",
            display: "grid",
            gap: "1.5rem",
          }}
        >
          {loading ? (
            <p style={{ margin: 0, color: "var(--muted)" }}>Loading ticket details...</p>
          ) : null}

          {error ? (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <p style={{ margin: 0, color: "#b91c1c", fontWeight: 600 }}>{error}</p>
              <Link href="/track" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
                Back to tracking
              </Link>
            </div>
          ) : null}

          {!loading && !error && ticket ? (
            <>
              <div>
                <h3
                  style={{
                    fontSize: "1.1rem",
                    fontWeight: 700,
                    marginBottom: "0.75rem",
                    color: "var(--text)",
                  }}
                >
                  {`${ticket.ticketType || "Ticket"} details`}
                </h3>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span
                    style={{
                      padding: "4px 12px",
                      borderRadius: 999,
                      background: "var(--surface)",
                      border: "1px solid #e5e7eb",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--accent)",
                    }}
                  >
                    {ticket.category || "Uncategorized"}
                  </span>
                  <span
                    style={{
                      padding: "4px 12px",
                      borderRadius: 999,
                      background: priorityStyle.bg,
                      border: `1px solid ${priorityStyle.border}`,
                      fontSize: 12,
                      fontWeight: 600,
                      color: priorityStyle.color,
                    }}
                  >
                    {(ticket.priority || "Low") + " Priority"}
                  </span>
                </div>
              </div>

              <div>
                <p
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    color: "var(--muted)",
                    marginBottom: "0.4rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Description
                </p>
                <p style={{ color: "var(--text)", fontSize: "0.95rem", lineHeight: 1.6, margin: 0 }}>
                  {ticket.description || "No description provided."}
                </p>
              </div>

              <div style={{ display: "grid", gap: "0.35rem" }}>
                {ticket.submittedAt ? (
                  <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.875rem" }}>
                    Submitted: {formatDate(ticket.submittedAt)}
                  </p>
                ) : null}
                {ticket.lastUpdatedAt ? (
                  <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.875rem" }}>
                    Last updated: {formatDate(ticket.lastUpdatedAt)}
                  </p>
                ) : null}
              </div>

              <div style={{ borderTop: "1px solid #e5e7eb" }} />

              {isResolvedLike(ticket.status) || !!feedbackInitial ? (
                <FeedbackForm
                  ticketId={ticket.reference || ticket.id}
                  onSubmit={submitFeedback}
                  initialData={feedbackInitial}
                />
              ) : null}

              <div>
                <p
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    color: "var(--muted)",
                    marginBottom: "1.25rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Status
                </p>

                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 14,
                      left: "calc(100% / 8)",
                      right: "calc(100% / 8)",
                      height: 3,
                      background: "#e5e7eb",
                      borderRadius: 999,
                      zIndex: 0,
                    }}
                  />

                  <div
                    style={{
                      position: "absolute",
                      top: 14,
                      left: "calc(100% / 8)",
                      width:
                        currentStep === 0
                          ? "0%"
                          : `calc(${(currentStep / (STEPS.length - 1)) * 100}% - 25%)`,
                      height: 3,
                      background: "var(--accent)",
                      borderRadius: 999,
                      transition: "width 0.4s ease",
                      zIndex: 1,
                    }}
                  />

                  {STEPS.map((step, index) => {
                    const done = index < currentStep;
                    const active = index === currentStep;
                    return (
                      <div
                        key={step}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 8,
                          zIndex: 2,
                          flex: 1,
                        }}
                      >
                        <div
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: "50%",
                            background: done || active ? "var(--accent)" : "var(--bg)",
                            border: `2.5px solid ${done || active ? "var(--accent)" : "#d1d5db"}`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.2s ease",
                          }}
                        >
                          {done ? (
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#fff"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : active ? (
                            <div
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: "#fff",
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: "#d1d5db",
                              }}
                            />
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: active ? 700 : 500,
                            color: active ? "var(--accent)" : done ? "var(--text)" : "var(--muted)",
                            textAlign: "center",
                            lineHeight: 1.3,
                          }}
                        >
                          {step}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function TicketDetailFallback({ id }: { id: string }) {
  return (
    <main style={{ background: "var(--surface)", minHeight: "100vh", padding: "48px 1rem" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <h1
          style={{
            fontSize: "1.8rem",
            fontWeight: 800,
            marginBottom: "1.5rem",
            color: "var(--text)",
          }}
        >
          Ticket: {id}
        </h1>
        <section
          style={{
            background: "var(--bg)",
            border: "1px solid #e5e7eb",
            borderRadius: "1rem",
            padding: "2rem",
          }}
        >
          <p style={{ margin: 0, color: "var(--muted)" }}>Loading ticket details...</p>
        </section>
      </div>
    </main>
  );
}
