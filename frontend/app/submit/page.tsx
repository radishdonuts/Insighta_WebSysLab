"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";

import { createClient as createSupabaseClient } from "@/utils/supabase/client";

type CategoryOption = {
  id: string;
  name: string;
};

type CategoriesResponse = {
  ok?: boolean;
  categories?: Array<{ id?: unknown; name?: unknown }>;
};

type TicketCreateResponse = {
  error?: string;
  details?: string;
  accessToken?: string;
  ticket?: {
    id?: string | null;
    reference?: string | null;
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeToken(value: unknown): string {
  const token = asString(value);
  return token ? token : "";
}

export default function SubmitPage() {
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [focused, setFocused] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const supabase = useMemo(() => createSupabaseClient(), []);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      setLoadingInitial(true);

      const [authResult, categoriesResult] = await Promise.all([
        supabase.auth.getUser(),
        fetch("/api/categories", { cache: "no-store" }).catch(() => null),
      ]);

      if (cancelled) return;

      setAuthUserId(authResult.data.user?.id ?? null);

      if (categoriesResult?.ok) {
        const payload = (await categoriesResult.json()) as CategoriesResponse;
        const nextCategories = (payload.categories ?? [])
          .map((entry) => {
            const id = asString(entry.id);
            const name = asString(entry.name);
            if (!id || !name) return null;
            return { id, name };
          })
          .filter((entry): entry is CategoryOption => entry !== null);

        setCategories(nextCategories);
      }

      setLoadingInitial(false);
    }

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const inputStyle = (name: string): CSSProperties => ({
    width: "100%",
    padding: "10px 14px",
    fontSize: "14px",
    fontFamily: "'DM Sans', sans-serif",
    border: `1.5px solid ${focused === name ? "#4f46e5" : "#d1d5db"}`,
    borderRadius: "8px",
    outline: "none",
    background: "#fff",
    color: "#111827",
    boxSizing: "border-box",
    transition: "border-color 0.2s, box-shadow 0.2s",
    boxShadow: focused === name ? "0 0 0 3px rgba(79,70,229,0.1)" : "none",
  });

  const labelStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    fontSize: "13px",
    fontWeight: 600,
    color: "#374151",
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: "0.01em",
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    const normalizedEmail = guestEmail.trim().toLowerCase();

    if (!trimmedDescription) {
      setError("Please provide a complaint description.");
      return;
    }

    if (!authUserId && !normalizedEmail) {
      setError("Email is required when submitting as a guest.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const payload: Record<string, string> = {
      description: trimmedTitle
        ? `Title: ${trimmedTitle}\n\n${trimmedDescription}`
        : trimmedDescription,
      ticketType: "Complaint",
    };

    if (categoryId) payload.categoryId = categoryId;
    if (authUserId) {
      payload.customerId = authUserId;
    } else {
      payload.guestEmail = normalizedEmail;
    }

    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as TicketCreateResponse;

      if (!response.ok) {
        throw new Error(asString(data.error) || asString(data.details) || "Failed to submit complaint.");
      }

      const query = new URLSearchParams();
      const ticketId = asString(data.ticket?.id);
      const reference = asString(data.ticket?.reference);
      const token = normalizeToken(data.accessToken);

      if (ticketId) query.set("ticketId", ticketId);
      if (reference) query.set("reference", reference);
      if (token) query.set("token", token);

      router.push(`/submit/confirmation${query.size ? `?${query.toString()}` : ""}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Failed to submit complaint."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap');

        .submit-btn {
          width: 100%;
          padding: 11px;
          background: #4f46e5;
          color: #fff;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          letter-spacing: 0.02em;
          transition: background 0.2s, transform 0.1s;
        }

        .submit-btn:hover { background: #4338ca; }
        .submit-btn:active { transform: scale(0.99); }
        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .card {
          animation: fadeUp 0.4s ease both;
        }

        .submit-error {
          margin: 0;
          font-size: 13px;
          font-weight: 600;
          color: #b91c1c;
        }

        .submit-hint {
          margin: 0;
          font-size: 12px;
          color: #6b7280;
          font-weight: 500;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 16px",
          fontFamily: "'DM Sans', sans-serif",
          background: "linear-gradient(180deg, #f0f4ff 0%, #ffffff 100%)",
        }}
      >
        <section
          className="card"
          style={{
            width: "100%",
            maxWidth: 460,
            background: "#ffffff",
            borderRadius: "16px",
            padding: "40px 36px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 8px 32px rgba(0,0,0,0.08)",
          }}
        >
          <header style={{ marginBottom: 28 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                background: "#eef2ff",
                borderRadius: "10px",
                marginBottom: 16,
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#4f46e5"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: "22px",
                fontWeight: 700,
                color: "#111827",
                fontFamily: "'DM Serif Display', serif",
                letterSpacing: "-0.3px",
              }}
            >
              Submit a Complaint
            </h1>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: "13.5px",
                color: "#6b7280",
                fontWeight: 400,
              }}
            >
              We&apos;ll review your complaint and get back to you.
            </p>
          </header>

          <form onSubmit={onSubmit} style={{ display: "grid", gap: 18 }}>
            <label style={labelStyle}>
              Title
              <input
                value={title}
                placeholder="Brief summary of the issue"
                onChange={(event) => setTitle(event.target.value)}
                onFocus={() => setFocused("title")}
                onBlur={() => setFocused(null)}
                style={inputStyle("title")}
              />
            </label>

            <label style={labelStyle}>
              Category
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                onFocus={() => setFocused("category")}
                onBlur={() => setFocused(null)}
                style={{
                  ...inputStyle("category"),
                  appearance: "none",
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 14px center",
                  paddingRight: "36px",
                  color: categoryId ? "#111827" : "#9ca3af",
                  cursor: "pointer",
                }}
              >
                <option value="">Use default category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id} style={{ color: "#111827" }}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            {!authUserId ? (
              <label style={labelStyle}>
                Email
                <input
                  type="email"
                  value={guestEmail}
                  placeholder="you@example.com"
                  onChange={(event) => setGuestEmail(event.target.value)}
                  onFocus={() => setFocused("email")}
                  onBlur={() => setFocused(null)}
                  style={inputStyle("email")}
                  required
                  autoComplete="email"
                />
              </label>
            ) : (
              <p className="submit-hint">Submitting as a signed-in user.</p>
            )}

            <label style={labelStyle}>
              Description
              <textarea
                value={description}
                placeholder="Please describe your complaint in detail..."
                onChange={(event) => setDescription(event.target.value)}
                onFocus={() => setFocused("description")}
                onBlur={() => setFocused(null)}
                rows={5}
                style={{
                  ...inputStyle("description"),
                  resize: "vertical",
                  lineHeight: "1.6",
                }}
                required
              />
            </label>

            {loadingInitial ? <p className="submit-hint">Loading ticket settings...</p> : null}
            {error ? <p className="submit-error">{error}</p> : null}

            <button type="submit" className="submit-btn" style={{ marginTop: 4 }} disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit Complaint"}
            </button>
          </form>

          <p
            style={{
              textAlign: "center",
              marginTop: 20,
              fontSize: "13px",
              color: "#9ca3af",
            }}
          >
            Changed your mind?{" "}
            <Link href="/" style={{ color: "#4f46e5", textDecoration: "none", fontWeight: 500 }}>
              Go back home
            </Link>
          </p>
        </section>
      </main>
    </>
  );
}
