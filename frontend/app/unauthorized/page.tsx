import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "4rem 1.25rem" }}>
      <h1>Access denied</h1>
      <p>You are signed in, but your account does not have permission to view this page.</p>
      <p>
        <Link href="/">Go home</Link>
        {" | "}
        <Link href="/login">Sign in as a different user</Link>
      </p>
    </main>
  );
}
