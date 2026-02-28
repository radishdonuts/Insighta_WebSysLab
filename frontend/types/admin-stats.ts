export type AdminStatsDateRange = {
  from: string;
  to: string;
  days: number;
};

export type AdminStatsBreakdownItem = {
  key: string;
  label: string;
  count: number;
  percentage: number;
};

export type AdminOverviewMetrics = {
  totalTickets: number;
  openInProgressTickets: number;
  resolvedTickets: number;
  unassignedTickets: number;
  createdToday: number;
  createdThisWeek: number;
};

export type AdminStatsOverviewResponse = {
  dateRange: AdminStatsDateRange;
  metrics: AdminOverviewMetrics;
  statusSnapshot: AdminStatsBreakdownItem[];
};

export type AdminTicketTrendPoint = {
  date: string;
  label: string;
  count: number;
};

export type AdminTicketsTrendsResponse = {
  dateRange: AdminStatsDateRange;
  granularity: "day";
  totalTickets: number;
  series: AdminTicketTrendPoint[];
};

export type AdminStatsBreakdownsResponse = {
  dateRange: AdminStatsDateRange;
  totalTickets: number;
  breakdowns: {
    status: AdminStatsBreakdownItem[];
    priority: AdminStatsBreakdownItem[];
    category: AdminStatsBreakdownItem[];
    sentiment: AdminStatsBreakdownItem[];
  };
};

export type AdminCreateStaffAccountRequest = {
  email: string;
  firstName?: string;
  lastName?: string;
  temporaryPassword?: string;
};

export type AdminCreateStaffAccountResponse = {
  message: string;
  account: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: "Staff";
    isActive: boolean;
    temporaryPassword: string;
  };
};
