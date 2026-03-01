"use client";

import React, { useState, useEffect } from "react";
import styles from "./sla-indicators.module.css";

export interface SLAIndicatorsProps {
    dueAt: string; // ISO string
    createdAt?: string; // Needed for accurate progress bar calculation
    variant?: "badge" | "bar";
}

// Icons
const ClockIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
    </svg>
);

const AlertTriangleIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
);

type SLAStatus = "on_track" | "warning" | "breached";

function getSLAState(dueAtStr: string): {
    status: SLAStatus;
    remainingHrs: number;
    isOverdue: boolean;
    label: string;
} {
    const dueAt = new Date(dueAtStr).getTime();
    const now = new Date().getTime();

    const diffMs = dueAt - now;
    const remainingHrs = diffMs / (1000 * 60 * 60);
    const isOverdue = diffMs < 0;

    if (isOverdue || remainingHrs < 4) {
        return {
            status: "breached",
            remainingHrs,
            isOverdue,
            label: isOverdue
                ? `Breached (${Math.abs(Math.round(remainingHrs))}h ago)`
                : `Critical (<${Math.ceil(remainingHrs)}h left)`
        };
    } else if (remainingHrs <= 24) {
        return {
            status: "warning",
            remainingHrs,
            isOverdue: false,
            label: `Warning (~${Math.round(remainingHrs)}h left)`
        };
    } else {
        return {
            status: "on_track",
            remainingHrs,
            isOverdue: false,
            label: "On Track"
        };
    }
}

export function SLAIndicator({ dueAt, createdAt, variant = "badge" }: SLAIndicatorsProps) {
    const [slaState, setSlaState] = useState(getSLAState(dueAt));

    // Update SLA state every minute to keep UI fresh
    useEffect(() => {
        const interval = setInterval(() => {
            setSlaState(getSLAState(dueAt));
        }, 60000);
        return () => clearInterval(interval);
    }, [dueAt]);

    const { status, label, isOverdue } = slaState;

    if (!dueAt) return null;

    if (variant === "badge") {
        let badgeClass = styles.statusOnTrack;
        if (status === "warning") badgeClass = styles.statusWarning;
        if (status === "breached") badgeClass = styles.statusBreached;

        const Icon = status === "breached" && isOverdue ? AlertTriangleIcon : ClockIcon;

        return (
            <div className={styles.container}>
                <div className={`${styles.badge} ${badgeClass}`}>
                    <Icon className={`${styles.icon} ${status === 'breached' && isOverdue ? styles.pulse : ''}`} />
                    <span>SLA: {label}</span>
                </div>
            </div>
        );
    }

    if (variant === "bar") {
        let fillClass = styles.barFillOnTrack;
        let iconColor = "#22c55e";

        if (status === "warning") {
            fillClass = styles.barFillWarning;
            iconColor = "#f59e0b";
        }
        if (status === "breached") {
            fillClass = styles.barFillBreached;
            iconColor = "#ef4444";
        }

        const Icon = status === "breached" && isOverdue ? AlertTriangleIcon : ClockIcon;

        // Calculate percentage for progress bar
        let percentage = 100; // default full
        if (createdAt) {
            const createdTime = new Date(createdAt).getTime();
            const dueTime = new Date(dueAt).getTime();
            const nowTime = new Date().getTime();

            const totalDuration = dueTime - createdTime;
            const elapsed = nowTime - createdTime;

            if (totalDuration > 0) {
                // As time passes, progress bar fills up (meaning less time left)
                percentage = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
            }
        } else {
            // If we don't have createdAt, estimate based on remaining hours
            // Assume standard SLA is 48 hours for calculation purposes
            const standardSLA = 48;
            const hoursPassed = standardSLA - slaState.remainingHrs;
            percentage = Math.min(100, Math.max(0, (hoursPassed / standardSLA) * 100));
        }

        // If overdue, bar is fully filled
        if (isOverdue) percentage = 100;

        return (
            <div className={styles.container} style={{ width: '100%' }}>
                <div className={styles.barContainer}>
                    <div className={styles.barHeader}>
                        <div className={styles.barHeaderLeft}>
                            <Icon className={styles.icon} style={{ color: iconColor }} />
                            <span>SLA Target</span>
                        </div>
                        <div className={styles.barHeaderRight} style={{ color: iconColor }}>
                            {label}
                        </div>
                    </div>
                    <div className={styles.barTrack}>
                        <div
                            className={`${styles.barFill} ${fillClass}`}
                            style={{ width: `${percentage}%` }}
                            role="progressbar"
                            aria-valuenow={percentage}
                            aria-valuemin={0}
                            aria-valuemax={100}
                        />
                    </div>
                </div>
            </div>
        );
    }

    return null;
}
