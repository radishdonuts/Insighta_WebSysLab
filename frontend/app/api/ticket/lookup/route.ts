import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim();

  if (!token) {
    return NextResponse.json({ ok: false, message: "Missing token." }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("guest_ticket_lookup", { p_token: token });

  if (error) {
    return NextResponse.json({ ok: false, message: "Lookup failed." }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    return NextResponse.json({ ok: false, message: "Invalid or expired link." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, ticket: row });
}