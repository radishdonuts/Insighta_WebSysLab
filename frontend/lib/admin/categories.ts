import type {
  AdminCategoriesResponse,
  AdminComplaintCategory,
  AdminCreateCategoryRequest,
  AdminCreateCategoryResponse,
  AdminUpdateCategoryRequest,
  AdminUpdateCategoryResponse,
} from "@/types/admin-ops";
import { asTrimmedString, type AdminSupabaseServerClient } from "@/lib/admin/common";
import { writeSystemActivityLog } from "@/lib/admin/activity-logs";

export { getAdminSupabase } from "@/lib/admin/common";
export { requireAdminApiAuth } from "@/lib/admin/common";

type JsonObject = Record<string, unknown>;

type CategoryMutationActor = {
  userId: string;
  ipAddress?: string | null;
};

type CategoryMutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "validation" | "conflict" | "not_found"; message: string };

type CategoryRow = {
  id: unknown;
  category_name: unknown;
  is_active: unknown;
  created_at: unknown;
  updated_at: unknown;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeCategoryName(value: string) {
  return value.trim().toLocaleLowerCase();
}

function validateCategoryName(name: string) {
  const trimmed = name.trim();

  if (!trimmed) {
    throw new Error("Category name is required.");
  }

  if (trimmed.length < 2) {
    throw new Error("Category name must be at least 2 characters.");
  }

  if (trimmed.length > 80) {
    throw new Error("Category name must be 80 characters or fewer.");
  }

  if (/[\r\n\t]/.test(trimmed)) {
    throw new Error("Category name must be a single line.");
  }

  return trimmed;
}

function mapCategory(row: CategoryRow): AdminComplaintCategory {
  return {
    id: asTrimmedString(row.id),
    name: asTrimmedString(row.category_name),
    isActive: row.is_active === true,
    createdAt: asNullableString(row.created_at),
    updatedAt: asNullableString(row.updated_at),
  };
}

async function listRawCategories(supabase: AdminSupabaseServerClient) {
  const { data, error } = await supabase
    .from("complaint_categories")
    .select("id, category_name, is_active, created_at, updated_at")
    .order("is_active", { ascending: false })
    .order("category_name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load complaint categories: ${error.message}`);
  }

  return (Array.isArray(data) ? data : []) as CategoryRow[];
}

async function ensureUniqueCategoryName(
  supabase: AdminSupabaseServerClient,
  categoryName: string,
  excludeCategoryId?: string
): Promise<void> {
  const rows = await listRawCategories(supabase);
  const target = normalizeCategoryName(categoryName);

  const conflict = rows.find((row) => {
    const id = asTrimmedString(row.id);
    if (excludeCategoryId && id === excludeCategoryId) return false;
    return normalizeCategoryName(asTrimmedString(row.category_name)) === target;
  });

  if (conflict) {
    throw new Error("A category with this name already exists.");
  }
}

async function getCategoryById(supabase: AdminSupabaseServerClient, categoryId: string) {
  const { data, error } = await supabase
    .from("complaint_categories")
    .select("id, category_name, is_active, created_at, updated_at")
    .eq("id", categoryId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load complaint category: ${error.message}`);
  }

  return data as CategoryRow | null;
}

async function getActiveCategoryCount(supabase: AdminSupabaseServerClient) {
  const { count, error } = await supabase
    .from("complaint_categories")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  if (error) {
    throw new Error(`Failed to count active complaint categories: ${error.message}`);
  }

  return typeof count === "number" ? count : 0;
}

export function parseCreateCategoryRequest(body: JsonObject): AdminCreateCategoryRequest {
  return {
    categoryName: validateCategoryName(asTrimmedString(body.categoryName)),
  };
}

export function parseUpdateCategoryRequest(body: JsonObject): AdminUpdateCategoryRequest {
  const hasCategoryName = Object.prototype.hasOwnProperty.call(body, "categoryName");
  const hasIsActive = Object.prototype.hasOwnProperty.call(body, "isActive");

  if (!hasCategoryName && !hasIsActive) {
    throw new Error('Provide at least one updatable field: "categoryName" or "isActive".');
  }

  const categoryName = hasCategoryName ? validateCategoryName(asTrimmedString(body.categoryName)) : undefined;

  let isActive: boolean | undefined;
  if (hasIsActive) {
    if (typeof body.isActive !== "boolean") {
      throw new Error('"isActive" must be a boolean.');
    }
    isActive = body.isActive;
  }

  return {
    ...(categoryName ? { categoryName } : {}),
    ...(typeof isActive === "boolean" ? { isActive } : {}),
  };
}

export function parseCategoryIdParam(value: string): string {
  const id = asTrimmedString(value);
  if (!isUuid(id)) {
    throw new Error("Category ID must be a valid UUID.");
  }
  return id;
}

export async function getAdminCategories(
  supabase: AdminSupabaseServerClient
): Promise<AdminCategoriesResponse> {
  const rows = await listRawCategories(supabase);
  return {
    categories: rows.map(mapCategory),
  };
}

export async function createAdminCategory(
  supabase: AdminSupabaseServerClient,
  input: AdminCreateCategoryRequest,
  actor: CategoryMutationActor
): Promise<CategoryMutationResult<AdminCreateCategoryResponse>> {
  try {
    await ensureUniqueCategoryName(supabase, input.categoryName);
  } catch (error) {
    return {
      ok: false,
      reason: /already exists/i.test(error instanceof Error ? error.message : "")
        ? "conflict"
        : "validation",
      message: error instanceof Error ? error.message : "Invalid category name.",
    };
  }

  const { data, error } = await supabase
    .from("complaint_categories")
    .insert({
      category_name: input.categoryName,
      is_active: true,
    })
    .select("id, category_name, is_active, created_at, updated_at")
    .single();

  if (error || !data) {
    return {
      ok: false,
      reason: "validation",
      message: error?.message ?? "Failed to create complaint category.",
    };
  }

  const category = mapCategory(data as CategoryRow);

  await writeSystemActivityLog(supabase, {
    userId: actor.userId,
    ipAddress: actor.ipAddress ?? null,
    action: "admin_category_created",
    entityType: "complaint_category",
    entityId: category.id,
  });

  return {
    ok: true,
    data: {
      message: "Category created successfully.",
      category,
    },
  };
}

export async function updateAdminCategory(
  supabase: AdminSupabaseServerClient,
  categoryId: string,
  input: AdminUpdateCategoryRequest,
  actor: CategoryMutationActor
): Promise<CategoryMutationResult<AdminUpdateCategoryResponse>> {
  const existing = await getCategoryById(supabase, categoryId);
  if (!existing) {
    return { ok: false, reason: "not_found", message: "Category not found." };
  }

  const current = mapCategory(existing);

  if (input.categoryName) {
    try {
      await ensureUniqueCategoryName(supabase, input.categoryName, categoryId);
    } catch (error) {
      return {
        ok: false,
        reason: /already exists/i.test(error instanceof Error ? error.message : "")
          ? "conflict"
          : "validation",
        message: error instanceof Error ? error.message : "Invalid category name.",
      };
    }
  }

  const nextName = input.categoryName ?? current.name;
  const nextIsActive = typeof input.isActive === "boolean" ? input.isActive : current.isActive;

  if (current.isActive && !nextIsActive) {
    const activeCount = await getActiveCategoryCount(supabase);
    if (activeCount <= 1) {
      return {
        ok: false,
        reason: "validation",
        message:
          "At least one active category is required. Activate another category before deactivating this one.",
      };
    }
  }

  const changedName = nextName !== current.name;
  const changedActive = nextIsActive !== current.isActive;

  if (!changedName && !changedActive) {
    return {
      ok: true,
      data: {
        message: "No changes were applied.",
        category: current,
      },
    };
  }

  const updates: Record<string, unknown> = {};
  if (changedName) updates.category_name = nextName;
  if (changedActive) updates.is_active = nextIsActive;

  const { data, error } = await supabase
    .from("complaint_categories")
    .update(updates)
    .eq("id", categoryId)
    .select("id, category_name, is_active, created_at, updated_at")
    .single();

  if (error || !data) {
    return {
      ok: false,
      reason: "validation",
      message: error?.message ?? "Failed to update complaint category.",
    };
  }

  const category = mapCategory(data as CategoryRow);
  const action = changedName && changedActive
    ? "admin_category_updated"
    : changedName
      ? "admin_category_renamed"
      : category.isActive
        ? "admin_category_activated"
        : "admin_category_deactivated";

  await writeSystemActivityLog(supabase, {
    userId: actor.userId,
    ipAddress: actor.ipAddress ?? null,
    action,
    entityType: "complaint_category",
    entityId: category.id,
  });

  return {
    ok: true,
    data: {
      message: changedName
        ? changedActive
          ? "Category name and status updated successfully."
          : "Category renamed successfully."
        : category.isActive
          ? "Category activated successfully."
          : "Category deactivated successfully.",
      category,
    },
  };
}
