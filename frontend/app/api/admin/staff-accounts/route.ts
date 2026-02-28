import { NextResponse } from "next/server";

import { jsonError, jsonServerError, parseJsonRequestBody } from "@/app/api/admin/_utils";
import {
  createStaffAccount,
  getAdminSupabase,
  parseCreateStaffAccountRequest,
  requireAdminApiAuth,
} from "@/lib/admin/staff-management";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authResult = await requireAdminApiAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  try {
    const body = await parseJsonRequestBody(request);
    const input = parseCreateStaffAccountRequest(body);
    const result = await createStaffAccount(getAdminSupabase(), input);

    if (!result.ok) {
      if (result.reason === "validation") {
        return jsonError(400, "Invalid request.", result.message);
      }

      return jsonError(409, "Conflict", result.message);
    }

    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /required|valid email|password/i.test(error.message)) {
      return jsonError(400, "Invalid request.", error.message);
    }

    return jsonServerError(error, "Failed to create Staff account.");
  }
}
