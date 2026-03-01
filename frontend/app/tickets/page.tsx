"use client";

import React, { useState, useEffect, useMemo, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./my-tickets.module.css";
import { TicketStatus, TicketPriority } from "@/types/tickets";

type UserTicket = {
    id: string;
    tracking_number: string | null;
    status: TicketStatus;
    priority: TicketPriority;
    category_name: string;
    description: string;
    submitted_at: string;
};

// SVG Icons
const SearchIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.searchIcon}>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);

const EmptyBoxIcon = () => (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={styles.emptyIcon}>
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
);

// Format relative date (e.g. "2 days ago")
function getRelativeDate(isoString: string) {
    const date = new Date(isoString);
    const diffInDays = Math.floor((new Date().getTime() - date.getTime()) / (1000 * 3600 * 24));

    if (diffInDays === 0) return "Today";
    if (diffInDays === 1) return "Yesterday";
    if (diffInDays < 30) return `${diffInDays} days ago`;
    return date.toLocaleDateString();
}

function getStatusClass(status: string) {
    switch (status) {
        case "Under Review": return styles.statusUnderReview;
        case "In Progress": return styles.statusInProgress;
        case "Resolved": return styles.statusResolved;
        case "Closed": return styles.statusClosed;
        case "Pending Customer Response": return styles.statusPending;
        default: return styles.statusClosed;
    }
}

function getPriorityClass(priority: string) {
    switch (priority) {
        case "High": return styles.priorityHigh;
        case "Medium": return styles.priorityMedium;
        case "Low": return styles.priorityLow;
        default: return styles.priorityMedium;
    }
}

async function fetchMyTickets(search: string, status: string, priority: string, page: number): Promise<{ tickets: UserTicket[], total: number }> {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (status && status !== "all") params.set("status", status);
    if (priority && priority !== "all") params.set("priority", priority);
    params.set("page", String(page));

    const res = await fetch(`/api/tickets/my?${params.toString()}`);
    if (!res.ok) {
        console.error("Failed to fetch tickets:", res.status);
        return { tickets: [], total: 0 };
    }
    return res.json();
}

export default function MyTicketsPage() {
    const router = useRouter();

    const [tickets, setTickets] = useState<UserTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);

    const [searchQuery, setSearchQuery] = useState("");
    const [tempSearch, setTempSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [priorityFilter, setPriorityFilter] = useState("all");
    const [page, setPage] = useState(1);
    const pageSize = 10;

    useEffect(() => {
        let active = true;
        setLoading(true);

        fetchMyTickets(searchQuery, statusFilter, priorityFilter, page).then(res => {
            if (!active) return;
            setTickets(res.tickets);
            setTotal(res.total);
            setLoading(false);
        });
        return () => { active = false };
    }, [searchQuery, statusFilter, priorityFilter, page]);

    const handleSearchSubmit = (e: FormEvent) => {
        e.preventDefault();
        setSearchQuery(tempSearch);
        setPage(1);
    };

    const totalPages = Math.ceil(total / pageSize) || 1;

    return (
        <main className={styles.container}>
            <div className={styles.header}>
                <h1>My Tickets</h1>
                <p>Track and manage your submitted complaints and inquiries.</p>
            </div>

            <div className={styles.controls}>
                <form onSubmit={handleSearchSubmit} className={styles.searchBar}>
                    <SearchIcon />
                    <input
                        type="text"
                        placeholder="Search by description..."
                        value={tempSearch}
                        onChange={(e) => setTempSearch(e.target.value)}
                        className={styles.searchInput}
                    />
                </form>

                <div className={styles.filterGroup}>
                    <select
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                        className={styles.select}
                        aria-label="Filter by Status"
                    >
                        <option value="all">All Statuses</option>
                        <option value="Under Review">Under Review</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Pending Customer Response">Pending Customer Response</option>
                        <option value="Resolved">Resolved</option>
                        <option value="Closed">Closed</option>
                    </select>

                    <select
                        value={priorityFilter}
                        onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
                        className={styles.select}
                        aria-label="Filter by Priority"
                    >
                        <option value="all">All Priorities</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                    </select>
                </div>
            </div>

            <div className={styles.listWrapper}>
                {loading ? (
                    <div className={styles.tableContainer}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Tracking #</th>
                                    <th>Category</th>
                                    <th>Description</th>
                                    <th>Status</th>
                                    <th>Priority</th>
                                    <th>Submitted</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...Array(5)].map((_, i) => (
                                    <tr key={i} className={styles.skeletonRow}>
                                        <td><div className={styles.skeletonCell} style={{ width: "80px" }}></div></td>
                                        <td><div className={styles.skeletonCell} style={{ width: "120px" }}></div></td>
                                        <td><div className={styles.skeletonCell} style={{ width: "250px" }}></div></td>
                                        <td><div className={styles.skeletonCell} style={{ width: "100px" }}></div></td>
                                        <td><div className={styles.skeletonCell} style={{ width: "70px" }}></div></td>
                                        <td><div className={styles.skeletonCell} style={{ width: "90px" }}></div></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : tickets.length === 0 ? (
                    <div className={styles.emptyState}>
                        <EmptyBoxIcon />
                        <h3 className={styles.emptyTitle}>No tickets found</h3>
                        <p className={styles.emptyDesc}>
                            {searchQuery || statusFilter !== "all" || priorityFilter !== "all"
                                ? "Try adjusting your filters or search terms."
                                : "You haven't submitted any complaints yet."}
                        </p>
                        {!(searchQuery || statusFilter !== "all" || priorityFilter !== "all") && (
                            <Link href="/submit" className={styles.btnPrimary}>
                                Submit a Complaint
                            </Link>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Desktop Table View */}
                        <div className={styles.tableContainer}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                         <th>Tracking #</th>
                                        <th>Category</th>
                                        <th>Description</th>
                                        <th>Status</th>
                                        <th>Priority</th>
                                        <th>Submitted</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tickets.map((ticket) => (
                                        <tr
                                            key={ticket.id}
                                            className={styles.tableRow}
                                            onClick={() => router.push(`/ticket/${ticket.id}${ticket.tracking_number ? `?token=${encodeURIComponent(ticket.tracking_number)}` : ""}`)}
                                        >
                                            <td className={styles.ticketNumber}>{ticket.tracking_number ?? "Pending"}</td>
                                            <td>{ticket.category_name}</td>
                                            <td className={styles.description}>{ticket.description}</td>
                                            <td>
                                                <span className={`${styles.badge} ${getStatusClass(ticket.status)}`}>
                                                    {ticket.status}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`${styles.badge} ${getPriorityClass(ticket.priority)}`}>
                                                    {ticket.priority}
                                                </span>
                                            </td>
                                            <td className={styles.date}>{getRelativeDate(ticket.submitted_at)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Card View */}
                        <div className={styles.mobileCardList}>
                            {tickets.map((ticket) => (
                                <div
                                    key={ticket.id}
                                    className={styles.mobileCard}
                                    onClick={() => router.push(`/ticket/${ticket.id}${ticket.tracking_number ? `?token=${encodeURIComponent(ticket.tracking_number)}` : ""}`)}
                                >
                                    <div className={styles.mobileHeader}>
                                        <span className={styles.ticketNumber}>{ticket.tracking_number ?? "Pending"}</span>
                                        <span className={styles.date}>{getRelativeDate(ticket.submitted_at)}</span>
                                    </div>
                                    <div className={styles.mobileBody}>
                                        <div className={styles.mobileTitle}>{ticket.category_name}</div>
                                        <div className={styles.description} style={{ whiteSpace: "normal", WebkitLineClamp: 2, display: "-webkit-box", WebkitBoxOrient: "vertical", maxWidth: "100%" }}>
                                            {ticket.description}
                                        </div>
                                    </div>
                                    <div className={styles.mobileBadges}>
                                        <span className={`${styles.badge} ${getStatusClass(ticket.status)}`}>
                                            {ticket.status}
                                        </span>
                                        <span className={`${styles.badge} ${getPriorityClass(ticket.priority)}`}>
                                            {ticket.priority}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Pagination */}
                        {total > 0 && (
                            <div className={styles.pagination}>
                                <div className={styles.pageInfo}>
                                    Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, total)} of {total} tickets
                                </div>
                                <div className={styles.pageControls}>
                                    <button
                                        className={styles.pageBtn}
                                        disabled={page === 1}
                                        onClick={() => setPage(page - 1)}
                                    >
                                        Previous
                                    </button>
                                    <button
                                        className={styles.pageBtn}
                                        disabled={page === totalPages}
                                        onClick={() => setPage(page + 1)}
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </main>
    );
}
