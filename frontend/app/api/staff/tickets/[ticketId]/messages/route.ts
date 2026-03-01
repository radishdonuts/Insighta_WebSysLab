import { NextResponse } from "next/server";

import { jsonError, jsonServerError, parseJsonRequestBody } from "@/app/api/staff/_utils";
import {
    getStaffSupabase,
    isUuid,
    requireStaffApiAuth,
    logSystemActivity,
    getRequestIpAddress,
} from "@/lib/staff/ticket-workspace";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ ticketId: string }> };

/**
 * GET /api/staff/tickets/[ticketId]/messages — list messages for a ticket.
 */
export async function GET(_request: Request, context: RouteContext) {
    const authResult = await requireStaffApiAuth();
    if (!authResult.ok) return authResult.response;

    const { ticketId } = await context.params;
    if (!isUuid(ticketId)) return jsonError(400, "Invalid ticket ID.");

    try {
        const supabase = getStaffSupabase();

        const { data, error } = await supabase
            .from("ticket_messages")
            .select(
                `id, content, sender_type, created_at,
         sender:profiles!ticket_messages_sender_id_fkey (id, email, first_name, last_name)`
            )
            .eq("ticket_id", ticketId)
            .order("created_at", { ascending: true });

        if (error) {
            console.error("[messages] Fetch failed:", error.message);
            return jsonError(500, "Failed to fetch messages.");
        }

        const messages = (data ?? []).map((row: Record<string, unknown>) => {
            const sender = row.sender as { id?: string; email?: string; first_name?: string; last_name?: string } | null;
            const firstName = sender?.first_name ?? null;
            const lastName = sender?.last_name ?? null;
            const displayName = [firstName, lastName].filter(Boolean).join(" ").trim() || sender?.email || "Unknown";

            return {
                id: row.id,
                content: row.content,
                senderType: row.sender_type,
                createdAt: row.created_at,
                sender: sender ? {
                    id: sender.id,
                    email: sender.email ?? null,
                    firstName,
                    lastName,
                    displayName,
                } : null,
            };
        });

        return NextResponse.json({ messages });
    } catch (err) {
        return jsonServerError(err, "Failed to load messages.");
    }
}

/**
 * POST /api/staff/tickets/[ticketId]/messages — staff sends a message to the submitter.
 */
export async function POST(request: Request, context: RouteContext) {
    const authResult = await requireStaffApiAuth();
    if (!authResult.ok) return authResult.response;

    const { ticketId } = await context.params;
    if (!isUuid(ticketId)) return jsonError(400, "Invalid ticket ID.");

    let body: Record<string, unknown>;
    try {
        body = await parseJsonRequestBody(request);
    } catch (e) {
        return jsonError(400, e instanceof Error ? e.message : "Invalid JSON.");
    }

    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) return jsonError(400, "Message content is required.");
    if (content.length > 5000) return jsonError(400, "Message must be 5000 characters or fewer.");

    try {
        const supabase = getStaffSupabase();

        const { data, error } = await supabase
            .from("ticket_messages")
            .insert({
                ticket_id: ticketId,
                sender_id: authResult.auth.userId,
                sender_type: "staff",
                content,
            })
            .select("id, content, sender_type, created_at")
            .single();

        if (error) {
            console.error("[messages] Insert failed:", error.message);
            return jsonError(500, "Failed to send message.");
        }

        await logSystemActivity(supabase, {
            userId: authResult.auth.userId,
            action: "staff_message_sent",
            entityType: "ticket",
            entityId: ticketId,
            ipAddress: getRequestIpAddress(request.headers),
        });

        return NextResponse.json(
            { message: "Message sent.", data },
            { status: 201 }
        );
    } catch (err) {
        return jsonServerError(err, "Failed to send message.");
    }
}
