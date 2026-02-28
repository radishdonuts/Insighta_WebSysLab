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
  status?: unknown;
  priority?: unknown;
  description?: unknown;
  submitted_at?: unknown;
  last_updated_at?: unknown;
  customer_id?: unknown;
  category?: unknown;
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function readCategoryName(value: unknown): string | null {
  if (Array.isArray(value)) {
    return readCategoryName(value[0]);
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  return asString((value as { category_name?: unknown }).category_name);
}

export async function GET(
  _request: Request,
  context: { params: { id: string } }
) {
  const ticketId = context.params.id;
  if (!isUuid(ticketId)) {
    return NextResponse.json(
      { ok: false, message: "Invalid ticket ID." },
      { status: 400 }
    );
  }

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: "Sign in to view this ticket." },
      { status: 401 }
    );
  }

  const supabase = getSupabaseServerClient();

  const { data: row, error } = await supabase
    .from("tickets")
    .select(
      `
        id,
        ticket_number,
        ticket_type,
        status,
        priority,
        description,
        submitted_at,
        last_updated_at,
        customer_id,
        category:complaint_categories!tickets_category_id_fkey (category_name)
      `
    )
    .eq("id", ticketId)
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

  let canAccess = customerId === user.id;

  if (!canAccess) {
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
    canAccess = profile?.is_active === true && !!role && STAFF_ROLE_SET.has(role);
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
      reference: asString(ticket.ticket_number),
      ticketType: asString(ticket.ticket_type),
      status: asString(ticket.status),
      priority: asString(ticket.priority),
      description: asString(ticket.description),
      submittedAt: asString(ticket.submitted_at),
      lastUpdatedAt: asString(ticket.last_updated_at),
      categoryName: readCategoryName(ticket.category),
    },
  });
}
