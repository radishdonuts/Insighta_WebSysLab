import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { hasMinimumRole, isUserRole } from "@/lib/auth/roles";
import type { UserRole } from "@/types/auth";

const AUTH_ONLY_PATHS = ["/ticket"] as const;
const ROLE_PROTECTED_PATHS: ReadonlyArray<{
  prefix: "/staff" | "/admin";
  minimumRole: UserRole;
}> = [
    { prefix: "/staff", minimumRole: "Staff" },
    { prefix: "/admin", minimumRole: "Admin" },
  ];

function matchesPathPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function buildRedirect(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  url.pathname = pathname;
  url.search = "";
  url.searchParams.set("next", next);

  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const roleProtectedRoute = ROLE_PROTECTED_PATHS.find(({ prefix }) =>
    matchesPathPrefix(pathname, prefix)
  );
  const isAuthOnlyRoute = AUTH_ONLY_PATHS.some((prefix) =>
    matchesPathPrefix(pathname, prefix)
  );

  // INS-101: Allow guest token-based access to /ticket/:id?token=...
  const hasGuestToken = isAuthOnlyRoute
    && matchesPathPrefix(pathname, "/ticket")
    && request.nextUrl.searchParams.has("token");

  if (hasGuestToken) {
    return NextResponse.next({ request });
  }

  const needsAuth = Boolean(roleProtectedRoute) || isAuthOnlyRoute;

  if (!needsAuth) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // refresh session if needed
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return buildRedirect(request, "/login");
  }

  if (!roleProtectedRoute || !user) {
    return response;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .limit(1)
    .maybeSingle();

  if (profileError) {
    console.error("Middleware role lookup failed:", profileError.message);
    return buildRedirect(request, "/unauthorized");
  }

  const role = profile?.role;
  const isActive = profile?.is_active === true;

  if (!isActive || !isUserRole(role) || !hasMinimumRole(role, roleProtectedRoute.minimumRole)) {
    return buildRedirect(request, "/unauthorized");
  }

  return response;
}

// Run middleware on all routes except static files
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
