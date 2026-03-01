import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/api-guards";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * GET /api/admin/analytics/staff — returns staff performance metrics.
 * Supports date range filtering via ?from= and ?to= query params.
 */
export async function GET(request: Request) {
    const guard = await requireRole("Admin");
    if (!guard.ok) return guard.response;

    try {
        const supabase = getSupabaseServerClient();
        const url = new URL(request.url);
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");

        // Fetch all staff profiles
        const { data: staffProfiles, error: profilesError } = await supabase
            .from("profiles")
            .select("id, email, first_name, last_name")
            .in("role", ["Staff", "Admin"]);

        if (profilesError) {
            return NextResponse.json({ error: "Failed to fetch staff profiles." }, { status: 500 });
        }

        // Fetch all tickets with assignment info
        let ticketQuery = supabase
            .from("tickets")
            .select("id, assigned_staff_id, status, priority, submitted_at, last_updated_at");

        if (from) ticketQuery = ticketQuery.gte("submitted_at", from);
        if (to) ticketQuery = ticketQuery.lte("submitted_at", to);

        const { data: tickets, error: ticketsError } = await ticketQuery;

        if (ticketsError) {
            return NextResponse.json({ error: "Failed to fetch ticket data." }, { status: 500 });
        }

        // Fetch feedback ratings
        const { data: feedbackData } = await supabase
            .from("feedback")
            .select("rating, ticket_id");

        // Build ticket-to-rating map
        const ticketRatingMap: Record<string, number> = {};
        for (const fb of feedbackData ?? []) {
            ticketRatingMap[fb.ticket_id as string] = fb.rating as number;
        }

        // Compute per-staff metrics
        const allTickets = tickets ?? [];
        const staffMetrics = (staffProfiles ?? []).map((profile: Record<string, unknown>) => {
            const staffId = profile.id as string;
            const firstName = (profile.first_name as string) ?? "";
            const lastName = (profile.last_name as string) ?? "";
            const name = [firstName, lastName].filter(Boolean).join(" ").trim() || (profile.email as string) || "Unknown";

            const assignedTickets = allTickets.filter(
                (t: Record<string, unknown>) => t.assigned_staff_id === staffId
            );
            const resolvedTickets = assignedTickets.filter(
                (t: Record<string, unknown>) => t.status === "Resolved" || t.status === "Closed"
            );
            const activeTickets = assignedTickets.filter(
                (t: Record<string, unknown>) => t.status !== "Resolved" && t.status !== "Closed"
            );

            // Avg resolution time (simplified: use last_updated_at - submitted_at for resolved tickets)
            let avgResolutionTimeHours = 0;
            if (resolvedTickets.length > 0) {
                let totalHours = 0;
                for (const t of resolvedTickets) {
                    const submitted = new Date(t.submitted_at as string).getTime();
                    const updated = new Date(t.last_updated_at as string).getTime();
                    totalHours += (updated - submitted) / (1000 * 60 * 60);
                }
                avgResolutionTimeHours = Math.round((totalHours / resolvedTickets.length) * 10) / 10;
            }

            // Avg rating
            const ratings = resolvedTickets
                .map((t: Record<string, unknown>) => ticketRatingMap[t.id as string])
                .filter((r): r is number => r !== undefined);
            const avgRating = ratings.length > 0
                ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
                : 0;

            return {
                id: staffId,
                name,
                email: profile.email,
                assignedCount: assignedTickets.length,
                resolvedCount: resolvedTickets.length,
                activeCount: activeTickets.length,
                avgResolutionTimeHours,
                avgRating,
            };
        });

        // Summary totals
        const totalResolved = staffMetrics.reduce((sum, s) => sum + s.resolvedCount, 0);
        const totalOverdue = 0; // Would require SLA computation
        const overallAvgResolution = staffMetrics.length > 0
            ? Math.round(
                (staffMetrics.reduce((sum, s) => sum + s.avgResolutionTimeHours, 0) / staffMetrics.filter(s => s.resolvedCount > 0).length || 1) * 10
            ) / 10
            : 0;
        const overallAvgRating = staffMetrics.length > 0
            ? Math.round(
                (staffMetrics.reduce((sum, s) => sum + s.avgRating, 0) / staffMetrics.filter(s => s.avgRating > 0).length || 1) * 10
            ) / 10
            : 0;

        return NextResponse.json({
            summary: {
                totalResolved,
                avgResolutionTimeHours: overallAvgResolution,
                avgRating: overallAvgRating,
                ticketsOverdue: totalOverdue,
            },
            staff: staffMetrics,
        });
    } catch (err) {
        console.error("[analytics/staff] Unexpected error:", err);
        return NextResponse.json({ error: "Internal server error." }, { status: 500 });
    }
}
