import { NextResponse } from "next/server";

import { jsonServerError } from "@/app/api/staff/_utils";
import {
  getStaffSupabase,
  listStaffTickets,
  parseStaffQueueFilters,
  requireStaffApiAuth,
} from "@/lib/staff/ticket-workspace";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authResult = await requireStaffApiAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  try {
    const searchParams = new URL(request.url).searchParams;
    const filters = parseStaffQueueFilters(searchParams);
    const response = await listStaffTickets(getStaffSupabase(), filters, authResult.auth.userId);
    return NextResponse.json(response);
  } catch (error) {
    return jsonServerError(error, "Failed to load staff tickets.");
  }
}
