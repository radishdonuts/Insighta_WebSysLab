import { randomBytes } from "crypto";

import type {
  AdminCreateStaffAccountRequest,
  AdminCreateStaffAccountResponse,
} from "@/types/admin-stats";
import {
  asNullableTrimmedString,
  asTrimmedString,
  sleep,
  type AdminSupabaseServerClient,
} from "@/lib/admin/common";

type JsonObject = Record<string, unknown>;

type StaffAccountCreateConflict = { ok: false; reason: "conflict"; message: string };
type StaffAccountCreateValidation = { ok: false; reason: "validation"; message: string };
type StaffAccountCreateSuccess = { ok: true; data: AdminCreateStaffAccountResponse };

export type CreateStaffAccountResult =
  | StaffAccountCreateConflict
  | StaffAccountCreateValidation
  | StaffAccountCreateSuccess;

export { getAdminSupabase } from "@/lib/admin/common";
export { requireAdminApiAuth } from "@/lib/admin/common";

function isEmailLike(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function generateTemporaryPassword() {
  return `Tmp!${randomBytes(12).toString("base64url")}`;
}

export function parseCreateStaffAccountRequest(body: JsonObject): AdminCreateStaffAccountRequest {
  const email = asTrimmedString(body.email).toLowerCase();
  const firstName = asNullableTrimmedString(body.firstName) ?? undefined;
  const lastName = asNullableTrimmedString(body.lastName) ?? undefined;
  const temporaryPassword = asNullableTrimmedString(body.temporaryPassword) ?? undefined;

  if (!email) {
    throw new Error("Email is required.");
  }

  if (!isEmailLike(email)) {
    throw new Error("Email must be a valid email address.");
  }

  if (temporaryPassword && temporaryPassword.length < 8) {
    throw new Error("Temporary password must be at least 8 characters.");
  }

  return {
    email,
    firstName,
    lastName,
    temporaryPassword,
  };
}

async function promoteProfileToStaff(
  supabase: AdminSupabaseServerClient,
  userId: string,
  input: AdminCreateStaffAccountRequest
) {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const { data, error } = await supabase
      .from("profiles")
      .update({
        email: input.email,
        first_name: input.firstName ?? null,
        last_name: input.lastName ?? null,
        role: "Staff",
        is_active: true,
      })
      .eq("id", userId)
      .select("id, email, first_name, last_name, role, is_active")
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to update Staff profile role: ${error.message}`);
    }

    if (data?.id) {
      return data;
    }

    await sleep(250);
  }

  throw new Error("Profile row was not found after creating auth user. The profile trigger may be delayed.");
}

function isAuthConflictMessage(message: string) {
  return /already|exists|registered|duplicate/i.test(message);
}

export async function createStaffAccount(
  supabase: AdminSupabaseServerClient,
  input: AdminCreateStaffAccountRequest
): Promise<CreateStaffAccountResult> {
  if (!input.email) {
    return { ok: false, reason: "validation", message: "Email is required." };
  }

  const temporaryPassword = input.temporaryPassword || generateTemporaryPassword();

  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      first_name: input.firstName ?? undefined,
      last_name: input.lastName ?? undefined,
    },
  });

  if (error) {
    if (isAuthConflictMessage(error.message)) {
      return {
        ok: false,
        reason: "conflict",
        message: "An account with this email already exists.",
      };
    }

    throw new Error(`Failed to create auth user: ${error.message}`);
  }

  const userId = data.user?.id;
  if (!userId) {
    throw new Error("Supabase did not return a user ID after creating the Staff account.");
  }

  const profile = await promoteProfileToStaff(supabase, userId, input);

  return {
    ok: true,
    data: {
      message: "Staff account created successfully. Share the temporary password securely and require a reset.",
      account: {
        id: String(profile.id),
        email: typeof profile.email === "string" ? profile.email : input.email,
        firstName: typeof profile.first_name === "string" ? profile.first_name : null,
        lastName: typeof profile.last_name === "string" ? profile.last_name : null,
        role: "Staff",
        isActive: profile.is_active === true,
        temporaryPassword,
      },
    },
  };
}
