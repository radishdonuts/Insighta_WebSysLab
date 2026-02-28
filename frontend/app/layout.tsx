import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

import { logoutAction } from "@/app/auth/actions";
import { getServerAuthRoleContext } from "@/lib/auth/server";
import type { UserRole } from "@/types/auth";

import "./globals.css";

export const metadata: Metadata = {
  title: "Insighta",
  description: "AI-Powered Complaint Resolution for Insurance"
};

type NavbarSessionState =
  | { status: "anonymous" }
  | { status: "authenticated"; accountLabel: string; role: UserRole | null };

async function getNavbarSessionState(): Promise<NavbarSessionState> {
  try {
    const result = await getServerAuthRoleContext();

    if (result.status === "unauthenticated") {
      return { status: "anonymous" };
    }

    const user = result.status === "authorized" ? result.auth.user : result.user;
    const accountLabel =
      typeof user.email === "string" && user.email.trim().length > 0
        ? user.email.trim()
        : `user:${user.id.slice(0, 8)}`;

    return {
      status: "authenticated",
      accountLabel,
      role: result.status === "authorized" ? result.auth.role : null,
    };
  } catch (error) {
    console.error("Navbar auth lookup failed:", error);
    return { status: "anonymous" };
  }
}

function getWorkspaceLink(role: UserRole | null) {
  if (role === "Admin") {
    return { href: "/admin", label: "Admin Workspace" as const };
  }

  if (role === "Staff") {
    return { href: "/staff", label: "Staff Workspace" as const };
  }

  return null;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getNavbarSessionState();
  const workspaceLink =
    session.status === "authenticated" ? getWorkspaceLink(session.role) : null;
  const roleBadge =
    session.status === "authenticated" &&
    (session.role === "Staff" || session.role === "Admin")
      ? session.role
      : null;

  return (
    <html lang="en">
      <body>
        {/* Navbar */}
        <nav className="navbar">
          <Link href="/" className="navbar-brand">
            <Image
              src="/assets/images/blue_logo.png"
              alt="Insighta logo"
              width={70}
              height={70}
              priority
            />
            Insighta
          </Link>

          <div className="navbar-links">
            <Link href="/about" className="nav-link">About</Link>

            {workspaceLink ? (
              <Link href={workspaceLink.href} className="nav-link">
                {workspaceLink.label}
              </Link>
            ) : null}

            <div
              className={`auth-indicator ${
                session.status === "authenticated"
                  ? "auth-indicator-signed"
                  : "auth-indicator-anon"
              }`}
              aria-live="polite"
            >
              <span className="auth-state-label">
                {session.status === "authenticated" ? "Signed in" : "Not signed in"}
              </span>

              {session.status === "authenticated" ? (
                <span className="auth-user-label" title={session.accountLabel}>
                  {session.accountLabel}
                </span>
              ) : null}

              {roleBadge ? (
                <span className={`auth-role-badge auth-role-${roleBadge.toLowerCase()}`}>
                  {roleBadge}
                </span>
              ) : null}
            </div>

            {session.status === "authenticated" ? (
              <form action={logoutAction} className="nav-inline-form">
                <button type="submit" className="nav-btn nav-btn-secondary">
                  Log out
                </button>
              </form>
            ) : (
              <>
                <Link href="/login" className="nav-link">Login</Link>
                <Link href="/register" className="nav-btn">Register</Link>
              </>
            )}
          </div>
        </nav>

        {children}
      </body>
    </html>
  );
}
