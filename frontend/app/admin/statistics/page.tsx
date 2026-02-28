import AdminStatisticsClient from "@/app/admin/statistics/AdminStatisticsClient";
import { requireAdminPageAccess } from "@/lib/admin/page-guard";

export default async function AdminStatisticsPage() {
  await requireAdminPageAccess("/admin/statistics");
  return <AdminStatisticsClient />;
}
