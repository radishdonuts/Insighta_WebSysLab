import { NextResponse } from "next/server";

import { jsonError, jsonServerError, parseJsonRequestBody } from "@/app/api/staff/_utils";
import { isEmailConfigured, sendTicketStatusUpdatedEmail } from "@/lib/email";
import {
  getRequestIpAddress,
  getStaffSupabase,
  isUuid,
  parseStatusUpdateRequest,
  requireStaffApiAuth,
  updateStaffTicketStatus,
} from "@/lib/staff/ticket-workspace";

export const runtime = "nodejs";

type TicketNotifyRow = {
  customer?: { email?: unknown } | Array<{ email?: unknown }> | null;
  guest?: { email?: unknown } | Array<{ email?: unknown }> | null;
  ticket_access_tokens?: Array<{ token_hash?: unknown }> | null;
};

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function pickTrackingNumber(tokens: unknown): string | null {
  if (!Array.isArray(tokens)) {
    return null;
  }

  const list = tokens
    .map((item) => asTrimmedString((item as { token_hash?: unknown })?.token_hash))
    .filter(Boolean);

  return list.find((value) => value.startsWith("TRK-")) || list[0] || null;
}

async function sendStatusUpdatedEmailSafe(input: {
  ticketId: string;
  status: string;
  remarks?: string;
}) {
  if (!isEmailConfigured()) {
    return;
  }

  const supabase = getStaffSupabase();
  const { data, error } = await supabase
    .from("tickets")
    .select(
      `
        customer:profiles!tickets_customer_id_fkey (email),
        guest:guest_contacts!tickets_guest_id_fkey (email),
        ticket_access_tokens!ticket_access_tokens_ticket_id_fkey (token_hash, created_at)
      `
    )
    .eq("id", input.ticketId)
    .order("created_at", { foreignTable: "ticket_access_tokens", ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[staff/status] Failed to load email recipient", {
      ticketId: input.ticketId,
      error: error.message,
    });
    return;
  }

  const row = (data ?? null) as TicketNotifyRow | null;
  const customer = firstRow(row?.customer);
  const guest = firstRow(row?.guest);
  const recipientEmail = asTrimmedString(customer?.email) || asTrimmedString(guest?.email);
  const trackingNumber = pickTrackingNumber(row?.ticket_access_tokens);

  if (!recipientEmail || !trackingNumber) {
    return;
  }

  try {
    await sendTicketStatusUpdatedEmail({
      to: recipientEmail,
      trackingNumber,
      status: input.status,
      remarks: input.remarks,
    });
  } catch (notifyError) {
    console.error("[staff/status] Failed to send status update email", {
      ticketId: input.ticketId,
      recipientEmail,
      error: notifyError instanceof Error ? notifyError.message : "Unknown error",
    });
  }
}

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

    if (result.ok && result.data.message === "Ticket status updated successfully.") {
      await sendStatusUpdatedEmailSafe({
        ticketId,
        status: result.data.ticket.status,
        remarks: input.remarks,
      });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    return jsonServerError(error, "Failed to update ticket status.");
  }
}
