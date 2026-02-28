import AdminDashboardClient from "@/app/admin/AdminDashboardClient";
import { requireAdminPageAccess } from "@/lib/admin/page-guard";

export default async function AdminDashboardPage() {
  await requireAdminPageAccess("/admin");
  return <AdminDashboardClient />;
}
