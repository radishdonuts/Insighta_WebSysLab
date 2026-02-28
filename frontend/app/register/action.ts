"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function safeNextPath(value: string) {
  if (!value || !value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}

function registerRedirect(path: string, params?: Record<string, string>) {
  const qs = new URLSearchParams(params ?? {});
  redirect(qs.size ? `${path}?${qs.toString()}` : path);
}

export async function registerAction(formData: FormData) {
  const firstName = readString(formData, "firstName");
  const lastName = readString(formData, "lastName");
  const email = readString(formData, "email").toLowerCase();
  const password = readString(formData, "password");
  const confirmPassword = readString(formData, "confirmPassword");
  const next = safeNextPath(readString(formData, "next"));

  if (!email || !password) {
    registerRedirect("/register", { error: "Email and password are required.", next });
  }

  if (password.length < 6) {
    registerRedirect("/register", { error: "Password must be at least 6 characters.", next });
  }

  if (confirmPassword !== password) {
    registerRedirect("/register", { error: "Passwords do not match.", next });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName || undefined,
        last_name: lastName || undefined,
      },
    },
  });

  if (error) {
    registerRedirect("/register", { error: error.message, next });
  }

  let message = "Registration successful.";

  if (data.session) {
    registerRedirect(next || "/", { message });
  }

  registerRedirect("/login", {
    message: `${message} Sign in with your new account.`,
    next: next || "/",
  });
}
