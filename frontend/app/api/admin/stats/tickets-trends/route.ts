import { NextResponse } from "next/server";

import { jsonServerError } from "@/app/api/admin/_utils";
import {
  getAdminSupabase,
  getAdminTicketTrends,
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
    const response = await getAdminTicketTrends(getAdminSupabase(), range);
    return NextResponse.json(response);
  } catch (error) {
    return jsonServerError(error, "Failed to load ticket trend stats.");
  }
}
