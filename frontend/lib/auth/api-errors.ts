import { NextResponse } from "next/server";

type AuthErrorStatus = 401 | 403;

function authErrorResponse(status: AuthErrorStatus, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

export function unauthorizedApiResponse(message = "Authentication required.") {
  return authErrorResponse(401, "Unauthorized", message);
}

export function forbiddenApiResponse(message = "Insufficient permissions.") {
  return authErrorResponse(403, "Forbidden", message);
}
