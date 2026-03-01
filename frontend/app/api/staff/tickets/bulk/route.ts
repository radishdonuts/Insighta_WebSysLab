import { NextResponse } from "next/server";

import { jsonError, jsonServerError, parseJsonRequestBody } from "@/app/api/staff/_utils";
import {
    getStaffSupabase,
    isUuid,
    requireStaffApiAuth,
    logSystemActivity,
    getRequestIpAddress,
} from "@/lib/staff/ticket-workspace";
import { TICKET_STATUSES } from "@/types/tickets";

export const runtime = "nodejs";

const VALID_STATUSES = new Set<string>(TICKET_STATUSES);

type BulkAction = "status" | "assign" | "unassign";

interface BulkRequest {
    ticketIds: string[];
    action: BulkAction;
    value?: string; // status value or staff user ID
}

function parseBulkRequest(body: Record<string, unknown>): BulkRequest {
    const ticketIds = body.ticketIds;
    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
        throw new Error("ticketIds must be a non-empty array.");
    }

    if (ticketIds.length > 50) {
        throw new Error("Cannot process more than 50 tickets at once.");
    }

    const invalidIds = ticketIds.filter((id) => typeof id !== "string" || !isUuid(id));
    if (invalidIds.length > 0) {
        throw new Error("All ticket IDs must be valid UUIDs.");
    }

    const action = typeof body.action === "string" ? body.action : "";
    if (!["status", "assign", "unassign"].includes(action)) {
        throw new Error('Action must be one of: "status", "assign", "unassign".');
    }

    const value = typeof body.value === "string" ? body.value.trim() : undefined;

    if (action === "status" && (!value || !VALID_STATUSES.has(value))) {
        throw new Error(`Value must be a valid status: ${TICKET_STATUSES.join(", ")}.`);
    }

    if (action === "assign" && (!value || !isUuid(value))) {
        throw new Error("Value must be a valid staff user UUID for assign action.");
    }

    return {
        ticketIds: ticketIds as string[],
        action: action as BulkAction,
        value,
    };
}

/**
 * POST /api/staff/tickets/bulk — apply bulk actions to multiple tickets.
 */
export async function POST(request: Request) {
    const authResult = await requireStaffApiAuth();
    if (!authResult.ok) return authResult.response;

    let body: Record<string, unknown>;
    try {
        body = await parseJsonRequestBody(request);
    } catch (e) {
        return jsonError(400, e instanceof Error ? e.message : "Invalid JSON.");
    }

    let bulkReq: BulkRequest;
    try {
        bulkReq = parseBulkRequest(body);
    } catch (e) {
        return jsonError(400, e instanceof Error ? e.message : "Invalid bulk request.");
    }

    try {
        const supabase = getStaffSupabase();
        const results: Array<{ ticketId: string; success: boolean; error?: string }> = [];

        for (const ticketId of bulkReq.ticketIds) {
            try {
                if (bulkReq.action === "status" && bulkReq.value) {
                    const { error } = await supabase
                        .from("tickets")
                        .update({ status: bulkReq.value })
                        .eq("id", ticketId);

                    if (error) throw error;

                    // Write status history
                    await supabase.from("ticket_status_history").insert({
                        ticket_id: ticketId,
                        old_status: "Unknown", // Simplified for bulk — could query first for accuracy
                        new_status: bulkReq.value,
                        changed_by_user_id: authResult.auth.userId,
                        remarks: "Bulk status update",
                    });

                    results.push({ ticketId, success: true });
                } else if (bulkReq.action === "assign" && bulkReq.value) {
                    const { error } = await supabase
                        .from("tickets")
                        .update({ assigned_staff_id: bulkReq.value })
                        .eq("id", ticketId);

                    if (error) throw error;
                    results.push({ ticketId, success: true });
                } else if (bulkReq.action === "unassign") {
                    const { error } = await supabase
                        .from("tickets")
                        .update({ assigned_staff_id: null })
                        .eq("id", ticketId);

                    if (error) throw error;
                    results.push({ ticketId, success: true });
                }
            } catch (ticketErr) {
                results.push({
                    ticketId,
                    success: false,
                    error: ticketErr instanceof Error ? ticketErr.message : "Unknown error",
                });
            }
        }

        const successCount = results.filter((r) => r.success).length;
        const failCount = results.filter((r) => !r.success).length;

        await logSystemActivity(supabase, {
            userId: authResult.auth.userId,
            action: `staff_bulk_${bulkReq.action}`,
            entityType: "tickets",
            entityId: `${successCount} success, ${failCount} failed`,
            ipAddress: getRequestIpAddress(request.headers),
        });

        return NextResponse.json({
            message: `Bulk action completed: ${successCount} succeeded, ${failCount} failed.`,
            results,
        });
    } catch (err) {
        return jsonServerError(err, "Failed to execute bulk action.");
    }
}
