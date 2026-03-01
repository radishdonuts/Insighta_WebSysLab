import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type TicketAuthContext = {
    ticketId: string;
    status: string;
    customerId: string | null;
    guestId: string | null;
    viewerType: "user" | "guest";
    authUserId: string | null;
};

function jsonError(status: number, error: string) {
    return NextResponse.json({ error }, { status });
}

function asString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed || null;
}

function isResolvedLikeStatus(status: string | null): boolean {
    if (!status) return false;
    const normalized = status.toLowerCase();
    return normalized === "resolved" || normalized === "closed";
}

async function readTicketById(supabase: ReturnType<typeof getSupabaseServerClient>, ticketId: string) {
    const { data, error } = await supabase
        .from("tickets")
        .select("id, status, customer_id, guest_id")
        .eq("id", ticketId)
        .limit(1)
        .maybeSingle();

    if (error) {
        throw new Error(`Failed to load ticket: ${error.message}`);
    }

    return data;
}

async function resolveFeedbackAccess(
    request: Request,
    ticketId: string
): Promise<TicketAuthContext | null> {
    const supabase = getSupabaseServerClient();
    const ticket = await readTicketById(supabase, ticketId);

    if (!ticket?.id) return null;

    const customerId = asString(ticket.customer_id);
    const guestId = asString(ticket.guest_id);
    const status = asString(ticket.status) ?? "";

    const authClient = await createClient();
    const {
        data: { user },
    } = await authClient.auth.getUser();

    if (user && customerId === user.id) {
        return {
            ticketId,
            status,
            customerId,
            guestId,
            viewerType: "user",
            authUserId: user.id,
        };
    }

    const token = new URL(request.url).searchParams.get("token")?.trim();
    if (!token) return null;

    const nowIso = new Date().toISOString();
    const { data: tokenRow, error: tokenError } = await supabase
        .from("ticket_access_tokens")
        .select("ticket_id")
        .eq("token_hash", token)
        .eq("ticket_id", ticketId)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .limit(1)
        .maybeSingle();

    if (tokenError) {
        throw new Error(`Failed to authorize ticket token: ${tokenError.message}`);
    }

    if (!tokenRow?.ticket_id) return null;

    return {
        ticketId,
        status,
        customerId,
        guestId,
        viewerType: "guest",
        authUserId: null,
    };
}

/**
 * GET /api/ticket/[id]/feedback — returns existing feedback for a ticket.
 */
export async function GET(_request: Request, context: RouteContext) {
    const { id: ticketId } = await context.params;

    if (!ticketId) {
        return jsonError(400, "Ticket ID is required.");
    }

    try {
        const access = await resolveFeedbackAccess(_request, ticketId);
        if (!access) {
            return jsonError(403, "You do not have access to this ticket feedback.");
        }

        const supabase = getSupabaseServerClient();

        const { data, error } = await supabase
            .from("feedback")
            .select("id, rating, comment, submitted_at")
            .eq("ticket_id", ticketId)
            .order("submitted_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error("[feedback] Fetch failed:", error.message);
            return jsonError(500, "Failed to fetch feedback.");
        }

        return NextResponse.json({ feedback: data ?? null });
    } catch (err) {
        console.error("[feedback] Unexpected error:", err);
        return jsonError(500, "Internal server error.");
    }
}

/**
 * POST /api/ticket/[id]/feedback — submits feedback for a ticket.
 * Enforces one feedback per ticket.
 */
export async function POST(request: Request, context: RouteContext) {
    const { id: ticketId } = await context.params;

    if (!ticketId) {
        return jsonError(400, "Ticket ID is required.");
    }

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return jsonError(400, "Request body must be valid JSON.");
    }

    const rating = typeof body.rating === "number" ? body.rating : 0;
    const comment =
        typeof body.comment === "string" ? body.comment.trim().slice(0, 500) : "";

    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
        return jsonError(400, "Rating must be an integer between 1 and 5.");
    }

    try {
        const access = await resolveFeedbackAccess(request, ticketId);
        if (!access) {
            return jsonError(403, "You do not have access to submit feedback for this ticket.");
        }

        if (!isResolvedLikeStatus(access.status)) {
            return jsonError(409, "Feedback can only be submitted after the ticket is resolved or closed.");
        }

        const supabase = getSupabaseServerClient();

        // Check if feedback already exists for this ticket
        const { data: existing, error: checkError } = await supabase
            .from("feedback")
            .select("id")
            .eq("ticket_id", ticketId)
            .limit(1)
            .maybeSingle();

        if (checkError) {
            console.error("[feedback] Check failed:", checkError.message);
            return jsonError(500, "Failed to check existing feedback.");
        }

        if (existing) {
            return jsonError(409, "Feedback has already been submitted for this ticket.");
        }

        // Insert feedback
        const insertPayload: Record<string, unknown> = {
            ticket_id: ticketId,
            rating,
            comment: comment || null,
        };

        if (access.viewerType === "user" && access.authUserId) {
            insertPayload.submitted_by_user_id = access.authUserId;
        } else if (access.viewerType === "guest" && access.guestId) {
            insertPayload.submitted_by_guest_id = access.guestId;
        }

        const { data: inserted, error: insertError } = await supabase
            .from("feedback")
            .insert(insertPayload)
            .select("id, rating, comment, submitted_at")
            .single();

        if (insertError) {
            console.error("[feedback] Insert failed:", insertError.message);
            return jsonError(500, "Failed to submit feedback.");
        }

        return NextResponse.json(
            { message: "Feedback submitted successfully.", feedback: inserted },
            { status: 201 }
        );
    } catch (err) {
        console.error("[feedback] Unexpected error:", err);
        return jsonError(500, "Internal server error.");
    }
}
