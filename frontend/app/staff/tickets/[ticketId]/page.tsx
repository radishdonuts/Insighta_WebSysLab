import StaffTicketDetailClient from "@/app/staff/tickets/[ticketId]/StaffTicketDetailClient";

export default function StaffTicketDetailPage({
  params,
}: {
  params: { ticketId: string };
}) {
  return <StaffTicketDetailClient ticketId={params.ticketId} />;
}
