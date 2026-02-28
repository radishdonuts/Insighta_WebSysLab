import { NextResponse } from "next/server";

import { jsonError, jsonServerError, parseJsonRequestBody } from "@/app/api/admin/_utils";
import { getRequestIpAddress } from "@/lib/admin/activity-logs";
import {
  createAdminCategory,
  getAdminCategories,
  getAdminSupabase,
  parseCreateCategoryRequest,
  requireAdminApiAuth,
} from "@/lib/admin/categories";

export const runtime = "nodejs";

export async function GET() {
  const authResult = await requireAdminApiAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  try {
    const data = await getAdminCategories(getAdminSupabase());
    return NextResponse.json(data);
  } catch (error) {
    return jsonServerError(error, "Failed to load complaint categories.");
  }
}

export async function POST(request: Request) {
  const authResult = await requireAdminApiAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  try {
    const body = await parseJsonRequestBody(request);
    const input = parseCreateCategoryRequest(body);
    const result = await createAdminCategory(getAdminSupabase(), input, {
      userId: authResult.auth.userId,
      ipAddress: getRequestIpAddress(request.headers),
    });

    if (!result.ok) {
      if (result.reason === "conflict") {
        return jsonError(409, "Conflict", result.message);
      }

      return jsonError(400, "Invalid request.", result.message);
    }

    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(400, "Invalid request.", error.message);
    }

    return jsonServerError(error, "Failed to create complaint category.");
  }
}
