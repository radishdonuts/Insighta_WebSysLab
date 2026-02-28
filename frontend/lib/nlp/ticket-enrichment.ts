import { requestNlpAnalysis, type NlpAnalysisResponse } from "@/lib/nlp/client";
import { getSupabaseServerClient } from "@/lib/supabase";

type SupabaseServerClient = ReturnType<typeof getSupabaseServerClient>;

export const UNCATEGORIZED_CATEGORY_NAME = "Uncategorized";

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildNlpInputText(title: string, description: string): string {
  const trimmedTitle = asTrimmedString(title);
  const trimmedDescription = asTrimmedString(description);
  return trimmedTitle ? `${trimmedTitle}\n\n${trimmedDescription}` : trimmedDescription;
}

export async function resolveActiveCategoryIdByName(
  supabase: SupabaseServerClient,
  categoryName: string
): Promise<string | null> {
  const target = asTrimmedString(categoryName);
  if (!target) return null;

  const exact = await supabase
    .from("complaint_categories")
    .select("id")
    .eq("category_name", target)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (exact.error) {
    throw new Error(`Failed to resolve category: ${exact.error.message}`);
  }

  if (exact.data?.id) {
    return asTrimmedString(exact.data.id) || null;
  }

  const fallback = await supabase
    .from("complaint_categories")
    .select("id")
    .ilike("category_name", target)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (fallback.error) {
    throw new Error(`Failed to resolve category: ${fallback.error.message}`);
  }

  return fallback.data?.id ? asTrimmedString(fallback.data.id) : null;
}

export async function resolveUncategorizedCategoryId(
  supabase: SupabaseServerClient
): Promise<string> {
  const categoryId = await resolveActiveCategoryIdByName(supabase, UNCATEGORIZED_CATEGORY_NAME);
  if (!categoryId) {
    throw new Error(`Active "${UNCATEGORIZED_CATEGORY_NAME}" category is required.`);
  }

  return categoryId;
}

type RunTicketNlpEnrichmentInput = {
  supabase: SupabaseServerClient;
  ticketId: string;
  text: string;
  allowCategoryOverride?: boolean;
  uncategorizedCategoryId?: string | null;
};

type RunTicketNlpEnrichmentResult = {
  analysis: NlpAnalysisResponse;
  nlpFieldsUpdated: boolean;
  categoryUpdated: boolean;
};

export async function runTicketNlpEnrichment(
  input: RunTicketNlpEnrichmentInput
): Promise<RunTicketNlpEnrichmentResult> {
  const ticketId = asTrimmedString(input.ticketId);
  const text = asTrimmedString(input.text);

  if (!ticketId) {
    throw new Error("Ticket ID is required for NLP enrichment.");
  }

  if (!text) {
    throw new Error("NLP enrichment text is required.");
  }

  const analysis = await requestNlpAnalysis({ text, ticketId });
  const updates: Record<string, string> = {};

  if (analysis.sentiment) updates.sentiment = analysis.sentiment;
  if (analysis.detectedIntent) updates.detected_intent = analysis.detectedIntent;
  if (analysis.issueType) updates.issue_type = analysis.issueType;
  if (analysis.priority) updates.priority = analysis.priority;

  let nlpFieldsUpdated = false;

  if (Object.keys(updates).length > 0) {
    const { error } = await input.supabase
      .from("tickets")
      .update(updates)
      .eq("id", ticketId);

    if (error) {
      throw new Error(`Failed to update NLP fields: ${error.message}`);
    }

    nlpFieldsUpdated = true;
  }

  let categoryUpdated = false;

  if (input.allowCategoryOverride !== false && input.uncategorizedCategoryId && analysis.categoryName) {
    const suggestedCategoryId = await resolveActiveCategoryIdByName(input.supabase, analysis.categoryName);

    if (suggestedCategoryId && suggestedCategoryId !== input.uncategorizedCategoryId) {
      const { data, error } = await input.supabase
        .from("tickets")
        .update({ category_id: suggestedCategoryId })
        .eq("id", ticketId)
        .eq("category_id", input.uncategorizedCategoryId)
        .select("id")
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to update ticket category: ${error.message}`);
      }

      categoryUpdated = !!asTrimmedString(data?.id);
    }
  }

  return {
    analysis,
    nlpFieldsUpdated,
    categoryUpdated,
  };
}
