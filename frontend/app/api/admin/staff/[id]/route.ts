import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/api-guards";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/staff/[id] — toggle active status or update role for a staff member.
 */
export async function PATCH(request: Request, context: RouteContext) {
    const guard = await requireRole("Admin");
    if (!guard.ok) return guard.response;

    const { id: staffId } = await context.params;

    if (!staffId) {
        return NextResponse.json({ error: "Staff ID is required." }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }

    try {
        const supabase = getSupabaseServerClient();

        // Build update payload
        const updates: Record<string, unknown> = {};

        if (typeof body.is_active === "boolean") {
            updates.is_active = body.is_active;
        }

        if (typeof body.role === "string" && ["Staff", "Admin"].includes(body.role)) {
            // Prevent demoting the last admin
            if (body.role === "Staff") {
                const { count, error: countError } = await supabase
                    .from("profiles")
                    .select("id", { count: "exact", head: true })
                    .eq("role", "Admin")
                    .eq("is_active", true);

                if (countError) {
                    return NextResponse.json({ error: "Failed to check admin count." }, { status: 500 });
                }

                if ((count ?? 0) <= 1 && staffId !== guard.auth.userId) {
                    // Allow if there's more than one admin, or if not demoting self
                }

                if ((count ?? 0) <= 1) {
                    // Check if the target is an admin
                    const { data: target } = await supabase
                        .from("profiles")
                        .select("role")
                        .eq("id", staffId)
                        .maybeSingle();

                    if (target?.role === "Admin") {
                        return NextResponse.json(
                            { error: "Cannot demote the last admin." },
                            { status: 400 }
                        );
                    }
                }
            }

            updates.role = body.role;
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
        }

        const { data, error } = await supabase
            .from("profiles")
            .update(updates)
            .eq("id", staffId)
            .select("id, email, first_name, last_name, role, is_active")
            .single();

        if (error) {
            console.error("[admin/staff] Update failed:", error.message);
            return NextResponse.json({ error: "Failed to update staff member." }, { status: 500 });
        }

        // Log activity
        await supabase.from("system_activity_logs").insert({
            user_id: guard.auth.userId,
            action: "admin_staff_updated",
            entity_type: "profile",
            entity_id: staffId,
        });

        return NextResponse.json({
            message: "Staff member updated.",
            staff: data,
        });
    } catch (err) {
        console.error("[admin/staff] Unexpected error:", err);
        return NextResponse.json({ error: "Internal server error." }, { status: 500 });
    }
}
