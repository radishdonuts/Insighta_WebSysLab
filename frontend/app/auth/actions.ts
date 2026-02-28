"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";

function redirectWithMessage(pathname: string, params?: Record<string, string>) {
  const search = new URLSearchParams(params ?? {});
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  redirect(`${pathname}${suffix}`);
}

export async function logoutAction() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Logout failed:", error.message);
    redirectWithMessage("/login", {
      error: "Could not sign out right now. Please try again.",
    });
  }

  redirectWithMessage("/login", {
    message: "You have been signed out.",
  });
}
