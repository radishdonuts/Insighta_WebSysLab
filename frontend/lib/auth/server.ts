import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { isUserRole } from "@/lib/auth/roles";
import { getSupabaseServerClient } from "@/lib/supabase";
import type { UserRole } from "@/types/auth";

type AuthenticatedRoleContext = {
  user: User;
  role: UserRole;
};

export type ServerRoleLookupResult =
  | { status: "unauthenticated" }
  | { status: "forbidden"; reason: "profile_not_found" | "inactive_profile" | "invalid_role"; user: User }
  | { status: "authorized"; auth: AuthenticatedRoleContext };

async function getSupabaseAuthServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            try {
              cookieStore.set(name, value, options);
            } catch {
              // Route handlers can rely on middleware session refresh when cookies are immutable.
            }
          }
        },
      },
    }
  );
}

export async function getServerAuthRoleContext(): Promise<ServerRoleLookupResult> {
  const authSupabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data: profile, error } = await getSupabaseServerClient()
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load user profile role: ${error.message}`);
  }

  if (!profile) {
    return { status: "forbidden", reason: "profile_not_found", user };
  }

  if (profile.is_active !== true) {
    return { status: "forbidden", reason: "inactive_profile", user };
  }

  if (!isUserRole(profile.role)) {
    return { status: "forbidden", reason: "invalid_role", user };
  }

  return {
    status: "authorized",
    auth: {
      user,
      role: profile.role,
    },
  };
}

export async function getAuthenticatedUserRole(): Promise<UserRole | null> {
  const result = await getServerAuthRoleContext();
  return result.status === "authorized" ? result.auth.role : null;
}
