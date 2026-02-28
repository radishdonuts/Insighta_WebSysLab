"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";
import { STAFF_WORKSPACE_ROLES } from "@/types/auth";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function safeNextPath(value: string) {
  if (!value || !value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}

function loginRedirect(path: string, params?: Record<string, string>) {
  const qs = new URLSearchParams(params ?? {});
  redirect(qs.size ? `${path}?${qs.toString()}` : path);
}

async function getPostLoginDefaultPath() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return "/";

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Login redirect role lookup failed:", error.message);
    return "/";
  }

  if (profile?.is_active === true && profile.role === "Admin") {
    return "/admin";
  }

  if (profile?.is_active === true && STAFF_WORKSPACE_ROLES.includes(profile.role)) {
    return "/staff";
  }

  return "/";
}

export async function loginAction(formData: FormData) {
  const email = readString(formData, "email").toLowerCase();
  const password = readString(formData, "password");
  const next = safeNextPath(readString(formData, "next"));

  if (!email || !password) {
    loginRedirect("/login", {
      error: "Email and password are required.",
      next,
    });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    loginRedirect("/login", {
      error: error.message,
      next,
    });
  }

  if (next && next !== "/") {
    loginRedirect(next);
  }

  loginRedirect(await getPostLoginDefaultPath());
}
