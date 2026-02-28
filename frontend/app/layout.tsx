import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import "./globals.css";

export const metadata: Metadata = {
  title: "Insighta",
  description: "AI-Powered Complaint Resolution for Insurance",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
            <Link href="/login" className="nav-link">Login</Link>
            <Link href="/register" className="nav-btn">Register</Link>
          </div>
        </nav>

        {children}
      </body>
    </html>
  );
}
