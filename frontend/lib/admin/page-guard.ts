import { redirect } from "next/navigation";

import { hasMinimumRole } from "@/lib/auth/roles";
import { getServerAuthRoleContext } from "@/lib/auth/server";

export async function requireAdminPageAccess(nextPath: string) {
  const result = await getServerAuthRoleContext();

  if (result.status === "unauthenticated") {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  if (result.status === "forbidden") {
    redirect("/unauthorized");
  }

  if (!hasMinimumRole(result.auth.role, "Admin")) {
    redirect("/unauthorized");
  }

  return result.auth;
}
