import AdminActivityClient from "@/app/admin/activity/AdminActivityClient";
import { requireAdminPageAccess } from "@/lib/admin/page-guard";

export default async function AdminActivityPage() {
  await requireAdminPageAccess("/admin/activity");
  return <AdminActivityClient />;
}
