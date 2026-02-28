"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import styles from "./admin.module.css";

function isActive(pathname: string, href: string) {
  return pathname === href;
}

export default function AdminNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const suffix = qs ? `?${qs}` : "";

  return (
    <nav className={styles.navTabs} aria-label="Admin workspace sections">
      <Link
        href={`/admin${suffix}`}
        className={`${styles.navTab} ${isActive(pathname, "/admin") ? styles.navTabActive : ""}`}
      >
        Overview
      </Link>
      <Link
        href={`/admin/statistics${suffix}`}
        className={`${styles.navTab} ${isActive(pathname, "/admin/statistics") ? styles.navTabActive : ""}`}
      >
        Statistics
      </Link>
      <Link
        href={`/admin/categories${suffix}`}
        className={`${styles.navTab} ${isActive(pathname, "/admin/categories") ? styles.navTabActive : ""}`}
      >
        Categories
      </Link>
      <Link
        href={`/admin/activity${suffix}`}
        className={`${styles.navTab} ${isActive(pathname, "/admin/activity") ? styles.navTabActive : ""}`}
      >
        Activity
      </Link>
    </nav>
  );
}
