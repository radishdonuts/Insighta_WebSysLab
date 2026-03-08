import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase";
import { STAFF_WORKSPACE_ROLES } from "@/types/auth";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

const STAFF_ROLE_SET = new Set<string>(STAFF_WORKSPACE_ROLES);

type TicketRow = {
  id?: unknown;
  ticket_number?: unknown;
  ticket_type?: unknown;
  title?: unknown;
  status?: unknown;
  priority?: unknown;
  description?: unknown;
  submitted_at?: unknown;
  last_updated_at?: unknown;
  customer_id?: unknown;
  category_name?: unknown;
  ticket_access_tokens?: unknown;
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function readTrackingCode(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const code = readTrackingCode(item);
      if (code) return code;
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;
  const token = asString((value as { token_hash?: unknown }).token_hash);
  return token && token.startsWith("TRK-") ? token : null;
}

export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  const ticketId = context.params.id;
  if (!isUuid(ticketId)) {
    return NextResponse.json(
      { ok: false, message: "Invalid ticket ID." },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const guestToken = asString(url.searchParams.get("token"));
  const nowIso = new Date().toISOString();

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  const supabase = getSupabaseServerClient();

  let guestTokenValidated = false;

  if (guestToken) {
    const tokenHash = sha256Hex(guestToken);
    const { data: tokenRow, error: tokenError } = await supabase
      .from("ticket_access_tokens")
      .select("ticket_id")
      .eq("ticket_id", ticketId)
      .or(`token_hash.eq.${guestToken},token_hash.eq.${tokenHash}`)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .limit(1)
      .maybeSingle();

    if (tokenError) {
      return NextResponse.json(
        { ok: false, message: "Failed to validate guest access token." },
        { status: 500 }
      );
    }

    guestTokenValidated = !!tokenRow?.ticket_id;
  }

  if (!user && !guestTokenValidated) {
    return NextResponse.json(
      { ok: false, message: "Sign in to view this ticket." },
      { status: 401 }
    );
  }

  const { data: row, error } = await supabase
    .from("tickets")
    .select(
      `
        id,
        ticket_number,
        ticket_type,
        title,
        status,
        priority,
        description,
        submitted_at,
        last_updated_at,
        customer_id,
        category_name,
        ticket_access_tokens!ticket_access_tokens_ticket_id_fkey (token_hash, created_at)
      `
    )
    .eq("id", ticketId)
    .order("created_at", { foreignTable: "ticket_access_tokens", ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, message: "Failed to load ticket." },
      { status: 500 }
    );
  }

  if (!row) {
    return NextResponse.json(
      { ok: false, message: "Ticket not found." },
      { status: 404 }
    );
  }

  const ticket = row as TicketRow;
  const customerId = asString(ticket.customer_id);
  const trackingNumber = guestTokenValidated
    ? guestToken
    : readTrackingCode(ticket.ticket_access_tokens);

  let canAccess = guestTokenValidated || customerId === user?.id;
  let isStaffViewer = false;

  if (!canAccess && user) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .limit(1)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json(
        { ok: false, message: "Failed to authorize ticket access." },
        { status: 500 }
      );
    }

    const role = asString(profile?.role);
    isStaffViewer = profile?.is_active === true && !!role && STAFF_ROLE_SET.has(role);
    canAccess = isStaffViewer;
  }

  if (!canAccess) {
    return NextResponse.json(
      { ok: false, message: "You do not have access to this ticket." },
      { status: 403 }
    );
  }

  return NextResponse.json({
    ok: true,
    ticket: {
      id: asString(ticket.id),
      reference: guestTokenValidated
        ? trackingNumber ?? "Tracking unavailable"
        : isStaffViewer
        ? asString(ticket.ticket_number)
        : trackingNumber ?? asString(ticket.ticket_number) ?? "Tracking unavailable",
      ticketType: asString(ticket.ticket_type),
      title: asString(ticket.title),
      status: asString(ticket.status),
      priority: asString(ticket.priority),
      description: asString(ticket.description),
      submittedAt: asString(ticket.submitted_at),
      lastUpdatedAt: asString(ticket.last_updated_at),
      categoryName: asString(ticket.category_name),
      guest_tracking_number: trackingNumber,
    },
  });
}
