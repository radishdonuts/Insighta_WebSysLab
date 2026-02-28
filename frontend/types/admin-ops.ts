import type { PaginatedResponse } from "@/types/api";

export type AdminComplaintCategory = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminCategoriesResponse = {
  categories: AdminComplaintCategory[];
};

export type AdminCreateCategoryRequest = {
  categoryName: string;
};

export type AdminCreateCategoryResponse = {
  message: string;
  category: AdminComplaintCategory;
};

export type AdminUpdateCategoryRequest = {
  categoryName?: string;
  isActive?: boolean;
};

export type AdminUpdateCategoryResponse = {
  message: string;
  category: AdminComplaintCategory;
};

export type AdminActivityLogUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
};

export type AdminActivityLogItem = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  timestamp: string | null;
  user: AdminActivityLogUser | null;
};

export type AdminActivityLogFilters = {
  action: string | null;
  entityType: string | null;
  user: string | null;
  userId: string | null;
  from: string | null;
  to: string | null;
};

export type AdminActivityLogsResponse = PaginatedResponse<AdminActivityLogItem> & {
  filters: AdminActivityLogFilters;
};
