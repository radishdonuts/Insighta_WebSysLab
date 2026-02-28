import Link from "next/link";

import { registerAction } from "@/app/register/action";

function readParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default function RegisterPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const error = readParam(searchParams?.error);
  const message = readParam(searchParams?.message);
  const next = readParam(searchParams?.next) || "/";

  return (
    <>
      <style>{`
        .register-wrapper {
          min-height: calc(100vh - 65px);
          background: linear-gradient(180deg, var(--surface) 0%, var(--bg) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1.5rem;
        }

        .register-card {
          background: var(--bg);
          border: 1px solid #e5e7eb;
          border-radius: 1.25rem;
          padding: 2.5rem 2.25rem;
          width: 100%;
          max-width: 440px;
          box-shadow: 0 4px 24px rgba(37, 99, 235, 0.06);
        }

        .register-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .register-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 52px;
          height: 52px;
          background: var(--surface);
          border-radius: 0.75rem;
          margin-bottom: 1rem;
        }

        .register-header h1 {
          font-size: 1.75rem;
          font-weight: 800;
          margin-bottom: 0.4rem;
        }

        .register-header p {
          color: var(--muted);
          font-size: 0.95rem;
          line-height: 1.6;
        }

        .register-form {
          display: grid;
          gap: 1.1rem;
        }

        .form-label {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text);
        }

        .form-input {
          padding: 0.65rem 0.9rem;
          border: 1.5px solid #d1d5db;
          border-radius: 0.55rem;
          font-size: 0.95rem;
          font-family: inherit;
          color: var(--text);
          background: var(--bg);
          transition: border-color 0.15s, box-shadow 0.15s;
          outline: none;
          width: 100%;
        }

        .form-input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }

        .form-input::placeholder {
          color: #9ca3af;
        }

        .register-submit {
          margin-top: 0.5rem;
          width: 100%;
          padding: 0.8rem;
          font-size: 1rem;
          font-weight: 600;
          font-family: inherit;
          background: var(--accent);
          color: #fff;
          border: none;
          border-radius: 0.55rem;
          cursor: pointer;
          transition: background 0.15s;
        }

        .register-submit:hover {
          background: var(--accent-hover);
        }

        .register-feedback {
          margin: 0 0 0.25rem;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .register-feedback-success {
          color: #166534;
        }

        .register-feedback-error {
          color: #b91c1c;
        }

        .register-footer {
          text-align: center;
          margin-top: 1.5rem;
          font-size: 0.9rem;
          color: var(--muted);
        }

        .register-footer a {
          color: var(--accent);
          font-weight: 600;
          text-decoration: none;
        }

        .register-footer a:hover {
          text-decoration: underline;
        }
      `}</style>

      <main className="register-wrapper">
        <section className="register-card">
          <div className="register-header">
            <div className="register-icon">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#2563eb"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <h1>Create an account</h1>
            <p>Get started with Insighta today</p>
          </div>

          {message ? <p className="register-feedback register-feedback-success">{message}</p> : null}
          {error ? <p className="register-feedback register-feedback-error">{error}</p> : null}

          <form action={registerAction} className="register-form">
            <input type="hidden" name="next" value={next} />

            <label className="form-label">
              Email
              <input
                name="email"
                type="email"
                className="form-input"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </label>

            <label className="form-label">
              Password
              <input
                name="password"
                type="password"
                className="form-input"
                placeholder="********"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </label>

            <label className="form-label">
              Confirm Password
              <input
                name="confirmPassword"
                type="password"
                className="form-input"
                placeholder="Re-enter your password"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </label>

            <button type="submit" className="register-submit">
              Create account
            </button>
          </form>

          <div className="register-footer">
            Already have an account?{" "}
            <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
          </div>
        </section>
      </main>
    </>
  );
}
