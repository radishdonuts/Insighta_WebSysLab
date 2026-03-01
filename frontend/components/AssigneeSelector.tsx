"use client";

import React, { useState, useRef, useEffect } from "react";
import styles from "./assignee-selector.module.css";

export interface StaffMember {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
}

export interface AssigneeSelectorProps {
    currentAssigneeId: string | null;
    staffList: StaffMember[];
    onAssign: (staffId: string | null) => Promise<void>;
    disabled?: boolean;
}

// SVG Icons
const ChevronDown = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
);

const CheckIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={styles.checkIcon}>
        <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
);

const UserIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
    </svg>
);

// Helper to get initials for placeholder avatar
function getInitials(name: string) {
    return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();
}

export function AssigneeSelector({
    currentAssigneeId,
    staffList,
    onAssign,
    disabled = false,
}: AssigneeSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Focus search input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        } else {
            setSearch(""); // Reset search when closed
        }
    }, [isOpen]);

    const currentAssignee = staffList.find((s) => s.id === currentAssigneeId);

    const filteredStaff = staffList.filter(
        (staff) =>
            staff.name.toLowerCase().includes(search.toLowerCase()) ||
            staff.email.toLowerCase().includes(search.toLowerCase())
    );

    const handleSelect = async (staffId: string | null) => {
        if (staffId === currentAssigneeId) {
            setIsOpen(false);
            return;
        }

        setIsOpen(false);
        setIsLoading(true);
        try {
            await onAssign(staffId);
        } catch (error) {
            console.error("Failed to assign ticket:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={styles.container} ref={containerRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                disabled={disabled || isLoading}
                className={styles.trigger}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
            >
                <div className={styles.triggerContent}>
                    {currentAssignee ? (
                        <>
                            <div className={styles.avatar}>
                                {currentAssignee.avatarUrl ? (
                                    <img src={currentAssignee.avatarUrl} alt="" className={styles.avatarImage} />
                                ) : (
                                    getInitials(currentAssignee.name)
                                )}
                            </div>
                            <span className={styles.triggerText}>{currentAssignee.name}</span>
                        </>
                    ) : (
                        <>
                            <div className={styles.avatar} style={{ background: "transparent", color: "var(--muted)" }}>
                                <UserIcon />
                            </div>
                            <span className={`${styles.triggerText} ${styles.placeholder}`}>Unassigned</span>
                        </>
                    )}
                </div>

                <div className={styles.icons}>
                    {isLoading ? <div className={styles.spinner} /> : <ChevronDown />}
                </div>
            </button>

            {isOpen && (
                <div className={styles.dropdown} role="listbox">
                    <div className={styles.searchBox}>
                        <input
                            ref={inputRef}
                            type="text"
                            className={styles.searchInput}
                            placeholder="Search staff..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>

                    <div className={styles.list}>
                        {/* Unassigned Option (always visible if searching matches "unassigned" or search is empty) */}
                        {("unassigned".includes(search.toLowerCase()) || search === "") && (
                            <div
                                className={`${styles.listItem} ${currentAssigneeId === null ? styles.listItemSelected : ""}`}
                                onClick={() => handleSelect(null)}
                                role="option"
                                aria-selected={currentAssigneeId === null}
                            >
                                <div className={styles.avatar} style={{ background: "transparent", border: "1px dashed var(--muted)" }}>
                                    <UserIcon />
                                </div>
                                <div className={styles.itemInfo}>
                                    <span className={styles.itemName} style={{ fontStyle: "italic", color: "var(--muted)" }}>
                                        Unassigned
                                    </span>
                                </div>
                                {currentAssigneeId === null && <CheckIcon />}
                            </div>
                        )}

                        {/* Staff Options */}
                        {filteredStaff.map((staff) => (
                            <div
                                key={staff.id}
                                className={`${styles.listItem} ${currentAssigneeId === staff.id ? styles.listItemSelected : ""}`}
                                onClick={() => handleSelect(staff.id)}
                                role="option"
                                aria-selected={currentAssigneeId === staff.id}
                            >
                                <div className={styles.avatar}>
                                    {staff.avatarUrl ? (
                                        <img src={staff.avatarUrl} alt="" className={styles.avatarImage} />
                                    ) : (
                                        getInitials(staff.name)
                                    )}
                                </div>
                                <div className={styles.itemInfo}>
                                    <span className={styles.itemName}>{staff.name}</span>
                                    <span className={styles.itemEmail}>{staff.email}</span>
                                </div>
                                {currentAssigneeId === staff.id && <CheckIcon />}
                            </div>
                        ))}

                        {filteredStaff.length === 0 && search !== "" && !("unassigned".includes(search.toLowerCase())) && (
                            <div className={styles.emptyState}>No staff found</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
