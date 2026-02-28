import { NextResponse } from "next/server";

import { jsonError, jsonServerError, parseJsonRequestBody } from "@/app/api/staff/_utils";
import {
  getRequestIpAddress,
  getStaffSupabase,
  isUuid,
  parseStatusUpdateRequest,
  requireStaffApiAuth,
  updateStaffTicketStatus,
} from "@/lib/staff/ticket-workspace";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
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

  let input: ReturnType<typeof parseStatusUpdateRequest>;
  try {
    const body = await parseJsonRequestBody(request);
    input = parseStatusUpdateRequest(body);
  } catch (error) {
    return jsonError(400, "Invalid request.", error instanceof Error ? error.message : "Invalid request body.");
  }

  try {
    const result = await updateStaffTicketStatus(
      getStaffSupabase(),
      ticketId,
      authResult.auth,
      input,
      getRequestIpAddress(request.headers)
    );

    if (!result.ok && result.reason === "not_found") {
      return jsonError(404, "Ticket not found.");
    }

    if (!result.ok && result.reason === "conflict") {
      return jsonError(409, "Conflict", result.message);
    }

    return NextResponse.json(result.data);
  } catch (error) {
    return jsonServerError(error, "Failed to update ticket status.");
  }
}
