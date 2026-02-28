import type { PaginatedResponse, PaginationMeta } from "@/types/api";
import type { TicketPriority, TicketStatus, TicketType } from "@/types/tickets";

export const STAFF_TICKET_TABS = ["my", "unassigned"] as const;
export type StaffTicketTab = (typeof STAFF_TICKET_TABS)[number];

export const STAFF_ASSIGNMENT_FILTERS = ["all", "mine", "assigned", "unassigned"] as const;
export type StaffAssignmentFilter = (typeof STAFF_ASSIGNMENT_FILTERS)[number];

export type StaffQueueFilters = {
  tab: StaffTicketTab;
  page: number;
  pageSize: number;
  status?: TicketStatus;
  priority?: TicketPriority;
  categoryId?: string;
  assignment: StaffAssignmentFilter;
  q?: string;
};

export type StaffPersonSummary = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
};

export type StaffCategorySummary = {
  id: string;
  name: string;
};

export type StaffTicketQueueItem = {
  id: string;
  ticketNumber: string;
  ticketType: TicketType | string;
  status: TicketStatus | string;
  priority: TicketPriority | string;
  description: string;
  submittedAt: string;
  lastUpdatedAt: string;
  category: StaffCategorySummary | null;
  assignedStaff: StaffPersonSummary | null;
  submitterType: "Customer" | "Guest" | "Unknown";
};

export type StaffTicketQueueResponse = PaginatedResponse<StaffTicketQueueItem> & {
  filters: StaffQueueFilters;
  categoryOptions: StaffCategorySummary[];
};

export type StaffAttachmentMetadata = {
  id: string;
  fileName: string;
  fileType: string | null;
  filePath: string;
  uploadedAt: string;
};

export type StaffTicketStatusHistoryItem = {
  id: string;
  oldStatus: string;
  newStatus: string;
  changedAt: string;
  remarks: string | null;
  changedBy: StaffPersonSummary | null;
};

export type StaffTicketFeedback = {
  id: string;
  rating: number;
  comment: string | null;
  submittedAt: string;
  submitterType: "Customer" | "Guest" | "Unknown";
  submittedBy: StaffPersonSummary | null;
  guestEmail: string | null;
};

export type StaffTicketDetail = {
  id: string;
  ticketNumber: string;
  ticketType: TicketType | string;
  status: TicketStatus | string;
  priority: TicketPriority | string;
  description: string;
  submittedAt: string;
  lastUpdatedAt: string;
  sentiment: string | null;
  detectedIntent: string | null;
  issueType: string | null;
  category: StaffCategorySummary | null;
  submitterType: "Customer" | "Guest" | "Unknown";
  submitter: StaffPersonSummary | null;
  guestEmail: string | null;
  assignedStaff: StaffPersonSummary | null;
  attachments: StaffAttachmentMetadata[];
  statusHistory: StaffTicketStatusHistoryItem[];
  feedback: StaffTicketFeedback | null;
};

export type StaffTicketDetailResponse = {
  ticket: StaffTicketDetail;
};

export type StaffStatusUpdateRequest = {
  status: TicketStatus | string;
  remarks?: string;
};

export type StaffStatusUpdateResponse = {
  message: string;
  ticket: Pick<StaffTicketDetail, "id" | "ticketNumber" | "status" | "lastUpdatedAt">;
  statusHistoryEntry?: StaffTicketStatusHistoryItem;
};

export type StaffAssignRequest = {
  action?: "self_assign";
};

export type StaffAssignResponse = {
  message: string;
  ticket: Pick<StaffTicketDetail, "id" | "ticketNumber" | "lastUpdatedAt"> & {
    assignedStaff: StaffPersonSummary | null;
  };
};

export type StaffQueueApiEnvelope = StaffTicketQueueResponse;
export type StaffPaginationMeta = PaginationMeta;
