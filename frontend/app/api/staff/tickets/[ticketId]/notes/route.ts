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
 * GET /api/staff/tickets/[ticketId]/notes — list internal notes for a ticket.
 */
export async function GET(_request: Request, context: RouteContext) {
    const authResult = await requireStaffApiAuth();
    if (!authResult.ok) return authResult.response;

    const { ticketId } = await context.params;
    if (!isUuid(ticketId)) return jsonError(400, "Invalid ticket ID.");

    try {
        const supabase = getStaffSupabase();

        const { data, error } = await supabase
            .from("ticket_notes")
            .select(
                `id, content, created_at,
         author:profiles!ticket_notes_author_id_fkey (id, email, first_name, last_name)`
            )
            .eq("ticket_id", ticketId)
            .order("created_at", { ascending: true });

        if (error) {
            console.error("[notes] Fetch failed:", error.message);
            return jsonError(500, "Failed to fetch notes.");
        }

        const notes = (data ?? []).map((row: Record<string, unknown>) => {
            const author = row.author as { id?: string; email?: string; first_name?: string; last_name?: string } | null;
            const firstName = author?.first_name ?? null;
            const lastName = author?.last_name ?? null;
            const displayName = [firstName, lastName].filter(Boolean).join(" ").trim() || author?.email || "Unknown";

            return {
                id: row.id,
                content: row.content,
                createdAt: row.created_at,
                author: author ? {
                    id: author.id,
                    email: author.email ?? null,
                    firstName,
                    lastName,
                    displayName,
                } : null,
            };
        });

        return NextResponse.json({ notes });
    } catch (err) {
        return jsonServerError(err, "Failed to load notes.");
    }
}

/**
 * POST /api/staff/tickets/[ticketId]/notes — add an internal note.
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
    if (!content) return jsonError(400, "Note content is required.");
    if (content.length > 2000) return jsonError(400, "Note content must be 2000 characters or fewer.");

    try {
        const supabase = getStaffSupabase();

        const { data, error } = await supabase
            .from("ticket_notes")
            .insert({
                ticket_id: ticketId,
                author_id: authResult.auth.userId,
                content,
            })
            .select("id, content, created_at")
            .single();

        if (error) {
            console.error("[notes] Insert failed:", error.message);
            return jsonError(500, "Failed to create note.");
        }

        await logSystemActivity(supabase, {
            userId: authResult.auth.userId,
            action: "staff_note_added",
            entityType: "ticket",
            entityId: ticketId,
            ipAddress: getRequestIpAddress(request.headers),
        });

        return NextResponse.json(
            { message: "Note added.", note: data },
            { status: 201 }
        );
    } catch (err) {
        return jsonServerError(err, "Failed to create note.");
    }
}
