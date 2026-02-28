import AdminCategoriesClient from "@/app/admin/categories/AdminCategoriesClient";
import { requireAdminPageAccess } from "@/lib/admin/page-guard";

export default async function AdminCategoriesPage() {
  await requireAdminPageAccess("/admin/categories");
  return <AdminCategoriesClient />;
}
