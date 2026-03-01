import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

function clampPage(raw: string | null): number {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function clampPageSize(raw: string | null): number {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
    return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}

function readTrackingCode(value: unknown): string | null {
    if (Array.isArray(value)) {
        const preferred = value
            .map((item) => readTrackingCode(item))
            .find((code) => typeof code === "string" && code.startsWith("TRK-"));
        if (preferred) return preferred;

        const fallback = value
            .map((item) => readTrackingCode(item))
            .find((code) => typeof code === "string");
        return fallback ?? null;
    }

    if (!value || typeof value !== "object") return null;
    const raw = (value as { token_hash?: unknown }).token_hash;
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export async function GET(request: Request) {
    const authClient = await createClient();
    const {
        data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const userId = user.id;
    const url = new URL(request.url);
    const search = (url.searchParams.get("q") ?? "").trim();
    const status = url.searchParams.get("status") ?? "";
    const priority = url.searchParams.get("priority") ?? "";
    const page = clampPage(url.searchParams.get("page"));
    const pageSize = clampPageSize(url.searchParams.get("pageSize"));

    try {
        const supabase = getSupabaseServerClient();

        // Build query for tickets belonging to this customer
        let query = supabase
            .from("tickets")
            .select(
                `id, status, priority, description, submitted_at,
         complaint_categories ( category_name ),
         ticket_access_tokens!ticket_access_tokens_ticket_id_fkey ( token_hash, created_at )`,
                { count: "exact" }
            )
            .eq("customer_id", userId)
            .order("created_at", { foreignTable: "ticket_access_tokens", ascending: false })
            .order("submitted_at", { ascending: false });

        // Apply filters
        if (status && status !== "all") {
            query = query.eq("status", status);
        }
        if (priority && priority !== "all") {
            query = query.eq("priority", priority);
        }
        if (search) {
            query = query.or(
                `description.ilike.%${search}%`
            );
        }

        // Pagination
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to);

        const { data, error, count } = await query;

        if (error) {
            console.error("[tickets/my] Query failed:", error.message);
            return NextResponse.json(
                { error: "Failed to fetch tickets." },
                { status: 500 }
            );
        }

        const tickets = (data ?? []).map((row: Record<string, unknown>) => {
            const cat = row.complaint_categories as
                | { category_name?: string }
                | null;
            const trackingNumber = readTrackingCode(row.ticket_access_tokens);
            return {
                id: row.id,
                tracking_number: trackingNumber,
                status: row.status,
                priority: row.priority,
                description: row.description,
                submitted_at: row.submitted_at,
                category_name: cat?.category_name ?? "Uncategorized",
            };
        });

        return NextResponse.json({ tickets, total: count ?? 0 });
    } catch (err) {
        console.error("[tickets/my] Unexpected error:", err);
        return NextResponse.json(
            { error: "Internal server error." },
            { status: 500 }
        );
    }
}
