import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/api-guards";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

const CONFIG_KEYS = ["nlp_provider", "nlp_api_key", "nlp_threshold", "nlp_auto_route"] as const;

/**
 * GET /api/admin/nlp-config — fetch NLP configuration settings.
 */
export async function GET() {
    const guard = await requireRole("Admin");
    if (!guard.ok) return guard.response;

    try {
        const supabase = getSupabaseServerClient();

        const { data, error } = await supabase
            .from("app_settings")
            .select("key, value")
            .in("key", CONFIG_KEYS as unknown as string[]);

        if (error) {
            // If the table doesn't exist, return defaults gracefully
            console.warn("[nlp-config] Fetch failed (table may not exist):", error.message);
            return NextResponse.json({
                config: {
                    provider: "gemini",
                    apiKey: "",
                    threshold: 0.85,
                    autoRoute: true,
                },
            });
        }

        const configMap: Record<string, unknown> = {};
        for (const row of data ?? []) {
            configMap[row.key as string] = row.value;
        }

        return NextResponse.json({
            config: {
                provider: configMap.nlp_provider ?? "gemini",
                apiKey: configMap.nlp_api_key ?? "",
                threshold: configMap.nlp_threshold ?? 0.85,
                autoRoute: configMap.nlp_auto_route ?? true,
            },
        });
    } catch (err) {
        console.error("[nlp-config] Unexpected error:", err);
        return NextResponse.json({ error: "Internal server error." }, { status: 500 });
    }
}

/**
 * PUT /api/admin/nlp-config — save NLP configuration settings.
 */
export async function PUT(request: Request) {
    const guard = await requireRole("Admin");
    if (!guard.ok) return guard.response;

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }

    try {
        const supabase = getSupabaseServerClient();

        const settings: Array<{ key: string; value: unknown }> = [];

        if (typeof body.provider === "string") {
            settings.push({ key: "nlp_provider", value: body.provider });
        }
        if (typeof body.apiKey === "string") {
            settings.push({ key: "nlp_api_key", value: body.apiKey });
        }
        if (typeof body.threshold === "number") {
            settings.push({ key: "nlp_threshold", value: body.threshold });
        }
        if (typeof body.autoRoute === "boolean") {
            settings.push({ key: "nlp_auto_route", value: body.autoRoute });
        }

        // Upsert each setting
        for (const setting of settings) {
            const { error } = await supabase
                .from("app_settings")
                .upsert(
                    {
                        key: setting.key,
                        value: setting.value,
                        updated_by: guard.auth.userId,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "key" }
                );

            if (error) {
                console.error(`[nlp-config] Failed to save ${setting.key}:`, error.message);
                return NextResponse.json(
                    { error: `Failed to save setting: ${setting.key}` },
                    { status: 500 }
                );
            }
        }

        // Log activity
        await supabase.from("system_activity_logs").insert({
            user_id: guard.auth.userId,
            action: "admin_nlp_config_updated",
            entity_type: "app_settings",
        });

        return NextResponse.json({ message: "Configuration saved successfully." });
    } catch (err) {
        console.error("[nlp-config] Unexpected error:", err);
        return NextResponse.json({ error: "Internal server error." }, { status: 500 });
    }
}
