"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";

type LookupResponse = {
  ok?: boolean;
  message?: string;
  ticket?: {
    ticket_id?: unknown;
    id?: unknown;
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function extractToken(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    return asString(url.searchParams.get("token")) || trimmed;
  } catch {
    const match = trimmed.match(/[?&]token=([^&]+)/i);
    if (match?.[1]) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }

    return trimmed;
  }
}

export default function TrackPage() {
  return (
    <Suspense fallback={<TrackPageShell />}>
      <TrackPageContent />
    </Suspense>
  );
}

function TrackPageContent() {
  const [tokenInput, setTokenInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tokenFromQuery = asString(searchParams.get("token"));
    if (tokenFromQuery) {
      setTokenInput(tokenFromQuery);
    }
  }, [searchParams]);

  async function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSearching) return;

    const token = extractToken(tokenInput);
    if (!token) {
      setError("Enter a ticket access token first.");
      return;
    }

    setError(null);
    setIsSearching(true);

    try {
      const response = await fetch(`/api/ticket/lookup?token=${encodeURIComponent(token)}`, {
        cache: "no-store",
      });

      const data = (await response.json()) as LookupResponse;

      if (!response.ok || data.ok !== true) {
        throw new Error(asString(data.message) || "Ticket lookup failed.");
      }

      const ticketId = asString(data.ticket?.ticket_id) || asString(data.ticket?.id);
      if (!ticketId) {
        throw new Error("Ticket lookup returned no ticket ID.");
      }

      router.push(`/ticket/${encodeURIComponent(ticketId)}?token=${encodeURIComponent(token)}`);
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : "Ticket lookup failed.");
    } finally {
      setIsSearching(false);
    }
  }

  return <TrackPageShell tokenInput={tokenInput} setTokenInput={setTokenInput} error={error} isSearching={isSearching} onSearch={onSearch} />;
}

function TrackPageShell({
  tokenInput = "",
  setTokenInput,
  error = null,
  isSearching = false,
  onSearch,
}: {
  tokenInput?: string;
  setTokenInput?: (value: string) => void;
  error?: string | null;
  isSearching?: boolean;
  onSearch?: (event: FormEvent<HTMLFormElement>) => void;
}) {
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
          Track Ticket
        </h1>

        <section
          className="card"
          style={{
            background: "var(--bg)",
            border: "1px solid #e5e7eb",
            borderRadius: "1rem",
            padding: "2rem",
          }}
        >
          <h3 style={{ marginBottom: "0.4rem" }}>Enter your ticket access token</h3>
          <p
            style={{
              color: "var(--muted)",
              fontSize: "0.95rem",
              lineHeight: 1.6,
              marginBottom: "1.5rem",
            }}
          >
            Use the token from your confirmation screen to check your ticket details.
          </p>

          <form onSubmit={onSearch} style={{ display: "grid", gap: 12 }}>
            <label
              style={{
                display: "grid",
                gap: 6,
                fontWeight: 500,
                fontSize: "0.95rem",
                color: "var(--text)",
              }}
            >
              Access Token
              <input
                value={tokenInput}
                onChange={(event) => setTokenInput?.(event.target.value)}
                placeholder="Paste your ticket token"
                style={{
                  width: "100%",
                  padding: "0.6rem 0.75rem",
                  borderRadius: "0.5rem",
                  border: "1.5px solid #d1d5db",
                  fontSize: "0.95rem",
                  outline: "none",
                  transition: "border-color 0.15s",
                  color: "var(--text)",
                  background: "var(--bg)",
                }}
                onFocus={(event) => {
                  event.currentTarget.style.borderColor = "var(--accent)";
                }}
                onBlur={(event) => {
                  event.currentTarget.style.borderColor = "#d1d5db";
                }}
              />
            </label>

            {error ? (
              <p style={{ margin: 0, color: "#b91c1c", fontSize: "0.875rem", fontWeight: 500 }}>{error}</p>
            ) : null}

            <button
              type="submit"
              style={{
                marginTop: 4,
                padding: "0.75rem 2rem",
                background: "var(--accent)",
                color: "#fff",
                fontWeight: 600,
                fontSize: "1rem",
                border: "none",
                borderRadius: "0.55rem",
                cursor: "pointer",
                transition: "background 0.15s",
                justifySelf: "start",
              }}
              disabled={isSearching}
              onMouseEnter={(event) => {
                if (!isSearching) {
                  event.currentTarget.style.background = "var(--accent-hover)";
                }
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = "var(--accent)";
              }}
            >
              {isSearching ? "Searching..." : "Search"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
