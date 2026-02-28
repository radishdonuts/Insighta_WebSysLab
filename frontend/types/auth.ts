export const USER_ROLES = ["Customer", "Staff", "Admin"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_RANK: Record<UserRole, number> = {
  Customer: 0,
  Staff: 1,
  Admin: 2,
};

export const STAFF_WORKSPACE_ROLES = ["Staff", "Admin"] as const satisfies readonly UserRole[];
export const ADMIN_WORKSPACE_ROLES = ["Admin"] as const satisfies readonly UserRole[];
