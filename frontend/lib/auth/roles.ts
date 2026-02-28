import { USER_ROLES, USER_ROLE_RANK, type UserRole } from "@/types/auth";

const USER_ROLE_SET = new Set<string>(USER_ROLES);

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && USER_ROLE_SET.has(value);
}

export function hasMinimumRole(currentRole: UserRole, minimumRole: UserRole): boolean {
  return USER_ROLE_RANK[currentRole] >= USER_ROLE_RANK[minimumRole];
}

export function hasAnyRole(currentRole: UserRole, allowedRoles: readonly UserRole[]): boolean {
  return allowedRoles.includes(currentRole);
}
