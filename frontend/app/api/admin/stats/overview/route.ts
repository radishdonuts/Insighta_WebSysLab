import { NextResponse } from "next/server";

import { jsonServerError } from "@/app/api/admin/_utils";
import {
  getAdminStatsOverview,
  getAdminSupabase,
  parseAdminStatsDateRange,
  requireAdminApiAuth,
} from "@/lib/admin/stats";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authResult = await requireAdminApiAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  try {
    const searchParams = new URL(request.url).searchParams;
    const range = parseAdminStatsDateRange(searchParams);
    const response = await getAdminStatsOverview(getAdminSupabase(), range);
    return NextResponse.json(response);
  } catch (error) {
    return jsonServerError(error, "Failed to load admin overview stats.");
  }
}
