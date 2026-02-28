import { NextResponse } from "next/server";

import { jsonError, jsonServerError } from "@/app/api/staff/_utils";
import {
  getStaffSupabase,
  getStaffTicketDetail,
  isUuid,
  requireStaffApiAuth,
} from "@/lib/staff/ticket-workspace";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: { ticketId: string } }
) {
  const authResult = await requireStaffApiAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const ticketId = context.params.ticketId;
  if (!isUuid(ticketId)) {
    return jsonError(400, "Invalid ticket ID.");
  }

  try {
    const detail = await getStaffTicketDetail(getStaffSupabase(), ticketId);
    if (!detail) {
      return jsonError(404, "Ticket not found.");
    }

    return NextResponse.json(detail);
  } catch (error) {
    return jsonServerError(error, "Failed to load ticket detail.");
  }
}
