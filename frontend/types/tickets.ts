export const TICKET_TYPES = ["Complaint", "Feedback"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_STATUSES = [
  "Under Review",
  "In Progress",
  "Pending Customer Response",
  "Resolved",
  "Closed",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["Low", "Medium", "High"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_SENTIMENTS = ["Negative", "Neutral", "Positive"] as const;
export type TicketSentiment = (typeof TICKET_SENTIMENTS)[number];
