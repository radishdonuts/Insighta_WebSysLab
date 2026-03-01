import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
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
  }

  if (!row?.ticket_id) {
    return NextResponse.json({ ok: false, message: "Invalid or expired link." }, { status: 404 });
  }

  const ticket = Array.isArray(row.ticket) ? row.ticket[0] : row.ticket;
  const ticketObject = ticket && typeof ticket === "object" ? ticket : null;

  void (async () => {
    try {
      await supabase
        .from("ticket_access_tokens")
        .update({ used_at: nowIso })
        .eq("token_hash", tokenHash);
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
