import type { NextResponse } from "next/server";

import { forbiddenApiResponse, unauthorizedApiResponse } from "@/lib/auth/api-errors";
import { hasAnyRole, hasMinimumRole } from "@/lib/auth/roles";
import { getServerAuthRoleContext } from "@/lib/auth/server";
import type { UserRole } from "@/types/auth";

export type ApiRoleGuardSuccess = {
  userId: string;
  email: string | null;
  role: UserRole;
};

export type ApiRoleGuardResult =
  | { ok: true; auth: ApiRoleGuardSuccess }
  | { ok: false; response: NextResponse };

function getForbiddenReasonMessage(reason: "profile_not_found" | "inactive_profile" | "invalid_role") {
  if (reason === "profile_not_found") return "Profile not found for authenticated user.";
  if (reason === "inactive_profile") return "Your account is inactive.";
  return "Your account role is invalid.";
}

export async function requireRole(minimumRole: UserRole): Promise<ApiRoleGuardResult> {
  const result = await getServerAuthRoleContext();

  if (result.status === "unauthenticated") {
    return { ok: false, response: unauthorizedApiResponse() };
  }

  if (result.status === "forbidden") {
    return { ok: false, response: forbiddenApiResponse(getForbiddenReasonMessage(result.reason)) };
  }

  if (!hasMinimumRole(result.auth.role, minimumRole)) {
    return { ok: false, response: forbiddenApiResponse() };
  }

  return {
    ok: true,
    auth: {
      userId: result.auth.user.id,
      email: result.auth.user.email ?? null,
      role: result.auth.role,
    },
  };
}

export async function requireAnyRole(allowedRoles: readonly UserRole[]): Promise<ApiRoleGuardResult> {
  if (allowedRoles.length === 0) {
    throw new Error("requireAnyRole requires at least one allowed role.");
  }

  const result = await getServerAuthRoleContext();

  if (result.status === "unauthenticated") {
    return { ok: false, response: unauthorizedApiResponse() };
  }

  if (result.status === "forbidden") {
    return { ok: false, response: forbiddenApiResponse(getForbiddenReasonMessage(result.reason)) };
  }

  if (!hasAnyRole(result.auth.role, allowedRoles)) {
    return { ok: false, response: forbiddenApiResponse() };
  }

  return {
    ok: true,
    auth: {
      userId: result.auth.user.id,
      email: result.auth.user.email ?? null,
      role: result.auth.role,
    },
  };
}
