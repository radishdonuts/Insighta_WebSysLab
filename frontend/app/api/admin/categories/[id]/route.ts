import { NextResponse } from "next/server";

import { jsonError, jsonServerError, parseJsonRequestBody } from "@/app/api/admin/_utils";
import { getRequestIpAddress } from "@/lib/admin/activity-logs";
import {
  getAdminSupabase,
  parseCategoryIdParam,
  parseUpdateCategoryRequest,
  requireAdminApiAuth,
  updateAdminCategory,
} from "@/lib/admin/categories";

export const runtime = "nodejs";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function PATCH(request: Request, context: RouteContext) {
  const authResult = await requireAdminApiAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  try {
    const categoryId = parseCategoryIdParam(context.params.id);
    const body = await parseJsonRequestBody(request);
    const input = parseUpdateCategoryRequest(body);
    const result = await updateAdminCategory(getAdminSupabase(), categoryId, input, {
      userId: authResult.auth.userId,
      ipAddress: getRequestIpAddress(request.headers),
    });

    if (!result.ok) {
      if (result.reason === "not_found") {
        return jsonError(404, "Not Found", result.message);
      }

      if (result.reason === "conflict") {
        return jsonError(409, "Conflict", result.message);
      }

      return jsonError(400, "Invalid request.", result.message);
    }

    return NextResponse.json(result.data);
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(400, "Invalid request.", error.message);
    }

    return jsonServerError(error, "Failed to update complaint category.");
  }
}
