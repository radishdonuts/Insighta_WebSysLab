"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function readParam(params: URLSearchParams, key: string): string {
  const value = params.get(key);
  return value ? value.trim() : "";
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<ConfirmationContent reference="UNKNOWN" token="" ticketId="" />}>
      <ConfirmationPageContent />
    </Suspense>
  );
}

function ConfirmationPageContent() {
  const params = useSearchParams();

  const ticketId = readParam(params, "ticketId");
  const reference = readParam(params, "reference") || readParam(params, "id") || "UNKNOWN";
  const token = readParam(params, "token");

  return <ConfirmationContent ticketId={ticketId} reference={reference} token={token} />;
}

function ConfirmationContent({
  ticketId,
  reference,
  token,
}: {
  ticketId: string;
  reference: string;
  token: string;
}) {

  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : "";
  const viewTicketHref = ticketId
    ? `/ticket/${encodeURIComponent(ticketId)}${tokenQuery}`
    : `/track${tokenQuery}`;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap');

        .card { animation: fadeUp 0.4s ease both; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .conf-btn-primary {
          display: inline-block;
          text-decoration: none;
          padding: 10px 20px;
          background: #4f46e5;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          border-radius: 8px;
          transition: background 0.2s, transform 0.1s;
        }

        .conf-btn-primary:hover { background: #4338ca; }
        .conf-btn-primary:active { transform: scale(0.99); }

        .conf-btn-outline {
          display: inline-block;
          text-decoration: none;
          padding: 10px 20px;
          background: #fff;
          color: #374151;
          font-size: 14px;
          font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          border-radius: 8px;
          border: 1.5px solid #d1d5db;
          transition: border-color 0.2s, background 0.2s;
        }

        .conf-btn-outline:hover {
          border-color: #4f46e5;
          background: #f5f3ff;
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
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              background: "#ecfdf5",
              borderRadius: "50%",
              marginBottom: 20,
            }}
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#10b981"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h1
            style={{
              margin: "0 0 8px",
              fontSize: "22px",
              fontWeight: 700,
              color: "#111827",
              fontFamily: "'DM Serif Display', serif",
              letterSpacing: "-0.3px",
            }}
          >
            Complaint Submitted!
          </h1>

          <p
            style={{
              margin: "0 0 24px",
              fontSize: "13.5px",
              color: "#6b7280",
              lineHeight: 1.6,
            }}
          >
            Your complaint has been received. We&apos;ll review it and get back to you shortly.
          </p>

          <div
            style={{
              background: "#f5f3ff",
              border: "1.5px dashed #c4b5fd",
              borderRadius: "10px",
              padding: "14px 20px",
              marginBottom: 28,
            }}
          >
            <p
              style={{
                margin: "0 0 4px",
                fontSize: "11px",
                fontWeight: 600,
                color: "#7c3aed",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Ticket Reference
            </p>
            <p
              style={{
                margin: 0,
                fontSize: "22px",
                fontWeight: 700,
                color: "#4f46e5",
                fontFamily: "monospace",
                letterSpacing: "0.1em",
              }}
            >
              {reference}
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <Link href={viewTicketHref} className="conf-btn-primary">
              View Ticket
            </Link>
            <Link href={`/track${tokenQuery}`} className="conf-btn-outline">
              Track a Ticket
            </Link>
          </div>

          <p
            style={{
              marginTop: 24,
              fontSize: "13px",
              color: "#9ca3af",
            }}
          >
            Need help?{" "}
            <Link
              href="/about"
              style={{ color: "#4f46e5", textDecoration: "none", fontWeight: 500 }}
            >
              Contact support
            </Link>
          </p>
        </section>
      </main>
    </>
  );
}
