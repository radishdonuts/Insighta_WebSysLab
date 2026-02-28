import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

type CategoryRow = {
  id?: unknown;
  category_name?: unknown;
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function GET() {
  try {
    const { data, error } = await getSupabaseServerClient()
      .from("complaint_categories")
      .select("id, category_name")
      .eq("is_active", true)
      .order("category_name", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, message: "Failed to load categories." },
        { status: 500 }
      );
    }

    const categories = (data ?? [])
      .map((row) => {
        const item = row as CategoryRow;
        const id = asString(item.id);
        const name = asString(item.category_name);
        if (!id || !name) return null;
        return { id, name };
      })
      .filter((item): item is { id: string; name: string } => item !== null);

    return NextResponse.json({ ok: true, categories });
  } catch {
    return NextResponse.json(
      { ok: false, message: "Failed to load categories." },
      { status: 500 }
    );
  }
}
