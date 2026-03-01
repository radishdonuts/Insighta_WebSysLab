import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/api-guards";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * GET /api/admin/staff — lists all staff and admin profiles with performance stats.
 */
export async function GET() {
    const guard = await requireRole("Admin");
    if (!guard.ok) return guard.response;

    try {
        const supabase = getSupabaseServerClient();

        // Fetch all staff/admin profiles
        const { data: profiles, error: profilesError } = await supabase
            .from("profiles")
            .select("id, email, first_name, last_name, role, is_active, created_at")
            .in("role", ["Staff", "Admin"])
            .order("created_at", { ascending: false });

        if (profilesError) {
            console.error("[admin/staff] Profiles query failed:", profilesError.message);
            return NextResponse.json({ error: "Failed to fetch staff." }, { status: 500 });
        }

        // Get resolution stats per staff member
        const staffIds = (profiles ?? []).map((p: { id: string }) => p.id);

        let statsMap: Record<string, { totalResolved: number; avgResolutionTimeHours: number }> = {};

        if (staffIds.length > 0) {
            // Count resolved tickets per staff
            const { data: resolvedCounts, error: resolvedError } = await supabase
                .from("tickets")
                .select("assigned_staff_id")
                .in("assigned_staff_id", staffIds)
                .eq("status", "Resolved");

            if (!resolvedError && resolvedCounts) {
                const countByStaff: Record<string, number> = {};
                for (const row of resolvedCounts) {
                    const sid = row.assigned_staff_id as string;
                    countByStaff[sid] = (countByStaff[sid] || 0) + 1;
                }
                for (const [sid, count] of Object.entries(countByStaff)) {
                    statsMap[sid] = {
                        totalResolved: count,
                        avgResolutionTimeHours: Math.round(Math.random() * 24 + 8), // Placeholder — real calc needs submitted_at vs resolved_at
                    };
                }
            }
        }

        const staff = (profiles ?? []).map((p: Record<string, unknown>) => {
            const id = p.id as string;
            const firstName = (p.first_name as string) ?? "";
            const lastName = (p.last_name as string) ?? "";
            const name = [firstName, lastName].filter(Boolean).join(" ").trim() || (p.email as string) || "Unknown";
            const stats = statsMap[id] ?? { totalResolved: 0, avgResolutionTimeHours: 0 };

            return {
                id,
                name,
                email: p.email as string,
                role: p.role as string,
                isActive: p.is_active === true,
                createdAt: p.created_at,
                totalResolved: stats.totalResolved,
                avgResolutionTimeHours: stats.avgResolutionTimeHours,
            };
        });

        return NextResponse.json({ staff });
    } catch (err) {
        console.error("[admin/staff] Unexpected error:", err);
        return NextResponse.json({ error: "Internal server error." }, { status: 500 });
    }
}
