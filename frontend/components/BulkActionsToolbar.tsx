"use client";

import React, { useState, useEffect, useRef } from "react";
import styles from "./bulk-actions.module.css";
import { TicketStatus } from "@/types/tickets";

export type BulkActionType = 'assign_to_me' | 'mark_resolved' | 'change_status' | 'delete';

export interface BulkActionsToolbarProps {
    selectedCount: number;
    onAction: (actionType: BulkActionType, value?: string) => void;
    onClear: () => void;
    isProcessing?: boolean;
}

// Icons
const UserPlusIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.btnIcon} aria-hidden>
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="8.5" cy="7" r="4"></circle>
        <line x1="20" y1="8" x2="20" y2="14"></line>
        <line x1="23" y1="11" x2="17" y2="11"></line>
    </svg>
);

const CheckCircleIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.btnIcon} aria-hidden>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
);

const TrashIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.btnIcon} aria-hidden>
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
);

const TagIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.btnIcon} aria-hidden>
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
        <line x1="7" y1="7" x2="7.01" y2="7"></line>
    </svg>
);

const XIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
);

export function BulkActionsToolbar({
    selectedCount,
    onAction,
    onClear,
    isProcessing = false
}: BulkActionsToolbarProps) {
    const [showStatusDropdown, setShowStatusDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowStatusDropdown(false);
            }
        }
        if (showStatusDropdown) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showStatusDropdown]);

    const handleAction = (type: BulkActionType, val?: string) => {
        onAction(type, val);
        setShowStatusDropdown(false);
    };

    const isVisible = selectedCount > 0;

    return (
        <div className={`${styles.container} ${isVisible ? styles.visible : ""}`} aria-hidden={!isVisible}>
            <div className={styles.selectionBox}>
                <span className={styles.badge}>{selectedCount}</span>
                <span className={styles.selectionText}>ticket{selectedCount !== 1 ? 's' : ''} selected</span>
            </div>

            <div className={styles.actions}>
                <button
                    className={styles.btn}
                    onClick={() => handleAction('assign_to_me')}
                    disabled={isProcessing}
                >
                    <UserPlusIcon /> Assign to me
                </button>

                <button
                    className={styles.btn}
                    onClick={() => handleAction('mark_resolved')}
                    disabled={isProcessing}
                >
                    <CheckCircleIcon /> Mark Resolved
                </button>

                <div className={styles.dropdownWrapper} ref={dropdownRef}>
                    <button
                        className={styles.btn}
                        onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                        disabled={isProcessing}
                    >
                        <TagIcon /> Change Status
                    </button>

                    {showStatusDropdown && (
                        <div className={styles.dropdownMenu}>
                            {(['Under Review', 'In Progress', 'Pending Customer Response', 'Closed'] as TicketStatus[]).map(status => (
                                <button
                                    key={status}
                                    className={styles.dropdownItem}
                                    onClick={() => handleAction('change_status', status)}
                                >
                                    {status}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className={styles.divider} />

                <button
                    className={`${styles.btn} ${styles.btnDanger}`}
                    onClick={() => {
                        if (confirm(`Are you sure you want to permanently delete ${selectedCount} tickets? This cannot be undone.`)) {
                            handleAction('delete');
                        }
                    }}
                    disabled={isProcessing}
                >
                    <TrashIcon /> Delete
                </button>
            </div>

            <button className={styles.closeBtn} onClick={onClear} aria-label="Clear selection">
                <XIcon />
            </button>
        </div>
    );
}
