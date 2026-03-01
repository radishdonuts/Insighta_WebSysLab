import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/api-guards";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * GET /api/admin/export/tickets — exports ticket data as CSV with optional filters.
 */
export async function GET(request: Request) {
    const guard = await requireRole("Admin");
    if (!guard.ok) return guard.response;

    try {
        const supabase = getSupabaseServerClient();
        const url = new URL(request.url);
        const status = url.searchParams.get("status");
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");

        let query = supabase
            .from("tickets")
            .select(
                `id, ticket_number, ticket_type, status, priority, description, submitted_at, last_updated_at,
         complaint_categories ( name ),
         profiles!tickets_assigned_staff_id_fkey ( email, first_name, last_name )`
            )
            .order("submitted_at", { ascending: false })
            .limit(5000); // Cap export size

        if (status && status !== "all") {
            query = query.eq("status", status);
        }
        if (from) {
            query = query.gte("submitted_at", from);
        }
        if (to) {
            query = query.lte("submitted_at", to);
        }

        const { data, error } = await query;

        if (error) {
            console.error("[export] Query failed:", error.message);
            return NextResponse.json({ error: "Failed to export tickets." }, { status: 500 });
        }

        // Build CSV
        const headers = [
            "Ticket #", "Type", "Status", "Priority", "Category", "Assignee",
            "Description", "Submitted At", "Last Updated At"
        ];

        const rows = (data ?? []).map((row: Record<string, unknown>) => {
            const cat = row.complaint_categories as { name?: string } | null;
            const staff = row.profiles as { email?: string; first_name?: string; last_name?: string } | null;
            const assignee = staff
                ? [staff.first_name, staff.last_name].filter(Boolean).join(" ").trim() || staff.email || ""
                : "";

            return [
                row.ticket_number,
                row.ticket_type,
                row.status,
                row.priority,
                cat?.name ?? "Uncategorized",
                assignee,
                `"${String(row.description ?? "").replace(/"/g, '""')}"`,
                row.submitted_at,
                row.last_updated_at,
            ].join(",");
        });

        const csv = [headers.join(","), ...rows].join("\n");

        // Log export activity
        await supabase.from("system_activity_logs").insert({
            user_id: guard.auth.userId,
            action: "admin_export_tickets",
            entity_type: "tickets",
            entity_id: `${rows.length} records`,
        });

        return new NextResponse(csv, {
            status: 200,
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="insighta-tickets-export-${new Date().toISOString().split("T")[0]}.csv"`,
            },
        });
    } catch (err) {
        console.error("[export] Unexpected error:", err);
        return NextResponse.json({ error: "Internal server error." }, { status: 500 });
    }
}
