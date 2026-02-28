import { requireRole } from "@/lib/auth/api-guards";
import { getSupabaseServerClient } from "@/lib/supabase";

export type AdminSupabaseServerClient = ReturnType<typeof getSupabaseServerClient>;

export function getAdminSupabase() {
  return getSupabaseServerClient();
}

export async function requireAdminApiAuth() {
  return requireRole("Admin");
}

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function asNullableTrimmedString(value: unknown): string | null {
  const trimmed = asTrimmedString(value);
  return trimmed || null;
}

export function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return (value[0] ?? null) as T | null;
  return (value ?? null) as T | null;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
