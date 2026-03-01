"use client";

import React, { useState, useEffect, useRef } from "react";
import styles from "./staff-directory.module.css";
import { UserRole } from "@/types/auth";

type StaffMember = {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    isActive: boolean;
    totalResolved: number;
    avgResolutionTimeHours: number;
};

// SVG Icons
const SearchIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
);

const PlusIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
);

const MoreIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="1"></circle>
        <circle cx="12" cy="5" r="1"></circle>
        <circle cx="12" cy="19" r="1"></circle>
    </svg>
);

// Helpers
function getInitials(name: string) {
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
}

function ActionsMenu({ id, onToggleStatus, isActive }: { id: string, onToggleStatus: (id: string) => void, isActive: boolean }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setOpen(false);
            }
        }
        if (open) document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open]);

    return (
        <div className={styles.menuContainer} ref={ref}>
            <button className={styles.actionBtn} onClick={() => setOpen(!open)} aria-label="More actions">
                <MoreIcon />
            </button>
            {open && (
                <div className={styles.dropdown}>
                    <button className={styles.dropdownItem} onClick={() => { setOpen(false); /* Open Edit Modal */ }}>
                        Edit Profile
                    </button>
                    <button className={styles.dropdownItem} onClick={() => { setOpen(false); /* API Call to reset password */ }}>
                        Reset Password
                    </button>
                    <button
                        className={`${styles.dropdownItem} ${isActive ? styles.itemDanger : ''}`}
                        onClick={() => { setOpen(false); onToggleStatus(id); }}
                    >
                        {isActive ? "Deactivate Account" : "Activate Account"}
                    </button>
                </div>
            )}
        </div>
    );
}

export default function StaffDirectoryPage() {
    const [search, setSearch] = useState("");
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        setLoading(true);

        fetch("/api/admin/staff")
            .then(res => res.json())
            .then(data => {
                if (!active) return;
                setStaff(data.staff ?? []);
                setLoading(false);
            })
            .catch(() => {
                if (!active) return;
                setLoading(false);
            });

        return () => { active = false };
    }, []);

    const toggleStatus = async (id: string) => {
        const member = staff.find(s => s.id === id);
        if (!member) return;

        try {
            const res = await fetch(`/api/admin/staff/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_active: !member.isActive }),
            });

            if (res.ok) {
                setStaff(prev => prev.map(s =>
                    s.id === id ? { ...s, isActive: !s.isActive } : s
                ));
            }
        } catch (err) {
            console.error("Failed to toggle status:", err);
        }
    };

    const filteredStaff = staff.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.email.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div className={styles.titleArea}>
                    <h1>Staff Directory</h1>
                    <p>Manage support agents, admins, and their system access.</p>
                </div>
                <button className={styles.btnPrimary}>
                    <PlusIcon /> Add Staff Member
                </button>
            </header>

            <div className={styles.toolbar}>
                <div className={styles.searchBox}>
                    <div className={styles.searchIcon}><SearchIcon /></div>
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Search by name or email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                {/* Potentially Add Role filters here */}
            </div>

            <div className={styles.card}>
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Member Info</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Performance</th>
                                <th style={{ width: '60px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                [...Array(4)].map((_, i) => (
                                    <tr key={i} className={styles.skeletonRow}>
                                        <td>
                                            <div className={styles.staffProfile}>
                                                <div className={styles.skeletonCell} style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%' }}></div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                                                    <div className={styles.skeletonCell} style={{ width: '120px' }}></div>
                                                    <div className={styles.skeletonCell} style={{ width: '180px' }}></div>
                                                </div>
                                            </div>
                                        </td>
                                        <td><div className={styles.skeletonCell} style={{ width: '60px' }}></div></td>
                                        <td><div className={styles.skeletonCell} style={{ width: '80px' }}></div></td>
                                        <td>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                <div className={styles.skeletonCell} style={{ width: '100px' }}></div>
                                                <div className={styles.skeletonCell} style={{ width: '70px' }}></div>
                                            </div>
                                        </td>
                                        <td><div className={styles.skeletonCell} style={{ width: '20px' }}></div></td>
                                    </tr>
                                ))
                            ) : filteredStaff.length === 0 ? (
                                <tr>
                                    <td colSpan={5}>
                                        <div className={styles.emptyState}>No staff members found matching "{search}".</div>
                                    </td>
                                </tr>
                            ) : (
                                filteredStaff.map(member => (
                                    <tr key={member.id} className={styles.tableRow}>
                                        <td>
                                            <div className={styles.staffProfile}>
                                                <div className={styles.avatar}>{getInitials(member.name)}</div>
                                                <div className={styles.staffInfo}>
                                                    <span className={styles.staffName}>{member.name}</span>
                                                    <span className={styles.staffEmail}>{member.email}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`${styles.roleBadge} ${member.role === 'Admin' ? styles.roleAdmin : ''}`}>
                                                {member.role}
                                            </span>
                                        </td>
                                        <td>
                                            <div className={styles.statusToggle}>
                                                <button
                                                    className={styles.toggleSwitch}
                                                    role="switch"
                                                    aria-checked={member.isActive}
                                                    onClick={() => toggleStatus(member.id)}
                                                    aria-label={`Toggle status for ${member.name}`}
                                                >
                                                    <span className={styles.toggleKnob} />
                                                </button>
                                                <span className={styles.statusLabel} style={{ color: member.isActive ? 'var(--text)' : 'var(--muted)' }}>
                                                    {member.isActive ? "Active" : "Inactive"}
                                                </span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className={styles.textStat}>{member.totalResolved} resolved</div>
                                            <div className={styles.textStat} style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                                                Avg: {member.avgResolutionTimeHours}h
                                            </div>
                                        </td>
                                        <td>
                                            <ActionsMenu id={member.id} onToggleStatus={toggleStatus} isActive={member.isActive} />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
