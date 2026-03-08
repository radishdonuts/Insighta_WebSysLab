import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { createClient } from "@/utils/supabase/server";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim();

  if (!token) {
    return NextResponse.json({ ok: false, message: "Missing token." }, { status: 400 });
  }

  const supabase = await createClient();
  const tokenHash = sha256Hex(token);
  const nowIso = new Date().toISOString();

  const baseSelect = `
        ticket_id,
        expires_at,
        ticket:tickets!ticket_access_tokens_ticket_id_fkey (
          status
        )
      `;

  const { data: plainRow, error: plainError } = await supabase
    .from("ticket_access_tokens")
    .select(baseSelect)
    .eq("token_hash", token)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .limit(1)
    .maybeSingle();

  if (plainError) {
    return NextResponse.json({ ok: false, message: "Lookup failed." }, { status: 500 });
  }

  let row = plainRow;
  let matchedTokenHash = row?.ticket_id ? token : "";

  if (!row?.ticket_id) {
    const { data: hashedRow, error } = await supabase
      .from("ticket_access_tokens")
      .select(baseSelect)
      .eq("token_hash", tokenHash)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, message: "Lookup failed." }, { status: 500 });
    }

    row = hashedRow;
    matchedTokenHash = row?.ticket_id ? tokenHash : "";
  }

  if (!row?.ticket_id) {
    const writer = getSupabaseServerClient();
    const { data: ticketRow, error: ticketError } = await writer
      .from("tickets")
      .select("id, status, ticket_number")
      .eq("ticket_number", token)
      .limit(1)
      .maybeSingle();

    if (ticketError) {
      return NextResponse.json({ ok: false, message: "Lookup failed." }, { status: 500 });
    }

    if (ticketRow?.id) {
      return NextResponse.json({
        ok: true,
        ticket: {
          status: ticketRow.status ?? null,
          guest_tracking_number: asString(ticketRow.ticket_number) ?? token,
        },
      });
    }
  }

  if (!row?.ticket_id) {
    return NextResponse.json({ ok: false, message: "Invalid or expired link." }, { status: 404 });
  }

  const ticket = Array.isArray(row.ticket) ? row.ticket[0] : row.ticket;
  const ticketObject = ticket && typeof ticket === "object" ? ticket : null;

  void (async () => {
    try {
      const writer = getSupabaseServerClient();
      const targetHash = matchedTokenHash || tokenHash;
      await writer
        .from("ticket_access_tokens")
        .update({ used_at: nowIso })
        .eq("token_hash", targetHash);
    } catch {}
  })();

  return NextResponse.json({
    ok: true,
    ticket: {
      status: ticketObject ? (ticketObject as { status?: unknown }).status ?? null : null,
      guest_tracking_number: token,
    },
  });
}
