"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";

import { createClient as createSupabaseClient } from "@/utils/supabase/client";

type LookupResponse = {
  ok?: boolean;
  message?: string;
  ticket?: {
    status?: unknown;
    guest_tracking_number?: unknown;
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
  const supabase = useMemo(() => createSupabaseClient(), []);
  const [tokenInput, setTokenInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusResult, setStatusResult] = useState<{ trackingNumber: string; status: string } | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let active = true;

    async function checkAuth() {
      const { data } = await supabase.auth.getUser();
      if (!active) return;

      if (data.user) {
        router.replace("/tickets");
        return;
      }

      setCheckingAuth(false);
    }

    void checkAuth();
    return () => {
      active = false;
    };
  }, [router, supabase]);

  useEffect(() => {
    if (checkingAuth) return;

    const tokenFromQuery = asString(searchParams.get("token"));
    if (tokenFromQuery) {
      setTokenInput(tokenFromQuery);
    }
  }, [checkingAuth, searchParams]);

  if (checkingAuth) {
    return <TrackPageShell isSearching />;
  }

  async function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSearching) return;

      const token = extractToken(tokenInput);
      if (!token) {
      setError("Enter your tracking number first.");
        return;
      }

    setError(null);
    setStatusResult(null);
    setIsSearching(true);

    try {
      const response = await fetch(`/api/ticket/lookup?token=${encodeURIComponent(token)}`, {
        cache: "no-store",
      });

      const data = (await response.json()) as LookupResponse;

      if (!response.ok || data.ok !== true) {
        throw new Error(asString(data.message) || "Ticket lookup failed.");
      }

      const status = asString(data.ticket?.status);
      if (!status) {
        throw new Error("Ticket lookup returned no status.");
      }

      const trackingNumber = asString(data.ticket?.guest_tracking_number) || token;
      setStatusResult({ trackingNumber, status });
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : "Ticket lookup failed.");
    } finally {
      setIsSearching(false);
    }
  }

  return <TrackPageShell tokenInput={tokenInput} setTokenInput={setTokenInput} error={error} isSearching={isSearching} onSearch={onSearch} statusResult={statusResult} />;
}

function TrackPageShell({
  tokenInput = "",
  setTokenInput,
  error = null,
  isSearching = false,
  onSearch,
  statusResult,
}: {
  tokenInput?: string;
  setTokenInput?: (value: string) => void;
  error?: string | null;
  isSearching?: boolean;
  onSearch?: (event: FormEvent<HTMLFormElement>) => void;
  statusResult?: { trackingNumber: string; status: string } | null;
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
            Use your guest tracking number from the confirmation screen to check your ticket status.
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
              Tracking Number
              <input
                value={tokenInput}
                onChange={(event) => setTokenInput?.(event.target.value)}
                placeholder="TRK-XXXX-XXXX-XXXX"
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

            {statusResult ? (
              <div
                style={{
                  marginTop: 8,
                  padding: "0.85rem 1rem",
                  borderRadius: "0.65rem",
                  border: "1px solid #dbeafe",
                  background: "#eff6ff",
                  display: "grid",
                  gap: 4,
                }}
              >
                <p style={{ margin: 0, fontSize: "0.78rem", color: "#1e3a8a", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  Tracking Number
                </p>
                <p style={{ margin: 0, fontFamily: "monospace", fontSize: "0.95rem", color: "#1e40af" }}>
                  {statusResult.trackingNumber}
                </p>
                <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", color: "#1e3a8a", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  Current Status
                </p>
                <p style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#0f172a" }}>
                  {statusResult.status}
                </p>
              </div>
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
