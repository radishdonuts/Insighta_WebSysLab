"use client";

import React, { useState, useEffect } from "react";
import styles from "./staff-analytics.module.css";

const TrendingUpIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
        <polyline points="17 6 23 6 23 12"></polyline>
    </svg>
);

const TrendingDownIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline>
        <polyline points="17 18 23 18 23 12"></polyline>
    </svg>
);

const LineChartIcon = () => (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 3v18h18"></path>
        <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"></path>
    </svg>
);

// Dummy Data Types
interface KPIData {
    resolved: { value: number, trend: number };
    avgTime: { value: string, trend: number };
    csat: { value: number, trend: number };
}

interface StaffPerformance {
    id: string;
    name: string;
    resolvedCount: number;
    avgCsat: number;
    percentageVal: number; // for CSS chart relative to max
}

export default function AnalyticsPage() {
    const [range, setRange] = useState<"7d" | "30d" | "quarter">("30d");
    const [loading, setLoading] = useState(true);

    const [kpi, setKpi] = useState<KPIData | null>(null);
    const [topPerformers, setTopPerformers] = useState<StaffPerformance[]>([]);

    useEffect(() => {
        setLoading(true);
        // Simulate API Fetch based on date range
        const timer = setTimeout(() => {
            // Dummy data representing "fetched" metrics
            const fetchedKpi: KPIData = {
                resolved: { value: range === '7d' ? 142 : range === '30d' ? 689 : 2105, trend: 12.5 },
                avgTime: { value: range === '7d' ? "4h 15m" : "5h 30m", trend: -8.2 }, // Lower is better
                csat: { value: 4.8, trend: 0.2 },
            };

            const fetchedPerformers: StaffPerformance[] = [
                { id: "1", name: "Bob Support", resolvedCount: range === '7d' ? 45 : 210, avgCsat: 4.9, percentageVal: 100 },
                { id: "2", name: "Alice Admin", resolvedCount: range === '7d' ? 38 : 185, avgCsat: 4.8, percentageVal: 88 },
                { id: "3", name: "Charlie Worker", resolvedCount: range === '7d' ? 32 : 140, avgCsat: 4.5, percentageVal: 66 },
                { id: "4", name: "Diana Rep", resolvedCount: range === '7d' ? 25 : 110, avgCsat: 4.7, percentageVal: 52 },
            ];

            setKpi(fetchedKpi);
            setTopPerformers(fetchedPerformers);
            setLoading(false);
        }, 1000);

        return () => clearTimeout(timer);
    }, [range]);

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div className={styles.titleArea}>
                    <h1>Staff Performance Analytics</h1>
                    <p>Monitor resolution times, satisfaction scores, and team output.</p>
                </div>

                <div className={styles.datePicker}>
                    <button
                        className={`${styles.dateBtn} ${range === '7d' ? styles.dateBtnActive : ''}`}
                        onClick={() => setRange('7d')}
                    >
                        Last 7 Days
                    </button>
                    <button
                        className={`${styles.dateBtn} ${range === '30d' ? styles.dateBtnActive : ''}`}
                        onClick={() => setRange('30d')}
                    >
                        Last 30 Days
                    </button>
                    <button
                        className={`${styles.dateBtn} ${range === 'quarter' ? styles.dateBtnActive : ''}`}
                        onClick={() => setRange('quarter')}
                    >
                        This Quarter
                    </button>
                </div>
            </header>

            {/* KPIs */}
            <div className={styles.kpiGrid}>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiTitle}>Total Tickets Resolved</div>
                    {loading || !kpi ? (
                        <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
                    ) : (
                        <>
                            <div className={styles.kpiValue}>{kpi.resolved.value.toLocaleString()}</div>
                            <div className={`${styles.kpiTrend} ${kpi.resolved.trend > 0 ? styles.trendUp : styles.trendDown}`}>
                                {kpi.resolved.trend > 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
                                Math.abs(kpi.resolved.trend)% from previous period
                            </div>
                        </>
                    )}
                </div>

                <div className={styles.kpiCard}>
                    <div className={styles.kpiTitle}>Average Resolution Time</div>
                    {loading || !kpi ? (
                        <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
                    ) : (
                        <>
                            <div className={styles.kpiValue}>{kpi.avgTime.value}</div>
                            {/* For time, down is good (green), up is bad (red) */}
                            <div className={`${styles.kpiTrend} ${kpi.avgTime.trend < 0 ? styles.trendUp : styles.trendDown}`}>
                                {kpi.avgTime.trend < 0 ? <TrendingDownIcon /> : <TrendingUpIcon />}
                                Math.abs(kpi.avgTime.trend)% from previous period
                            </div>
                        </>
                    )}
                </div>

                <div className={styles.kpiCard}>
                    <div className={styles.kpiTitle}>Customer Satisfaction (CSAT)</div>
                    {loading || !kpi ? (
                        <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
                    ) : (
                        <>
                            <div className={styles.kpiValue}>{kpi.csat.value} <span style={{ fontSize: '1rem', color: 'var(--muted)' }}>/ 5.0</span></div>
                            <div className={`${styles.kpiTrend} ${kpi.csat.trend > 0 ? styles.trendUp : styles.trendNeutral}`}>
                                {kpi.csat.trend > 0 ? <TrendingUpIcon /> : null}
                                {kpi.csat.trend > 0 ? '+' : ''}{kpi.csat.trend} points
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Charts Area */}
            <div className={styles.chartsGrid}>
                <div className={styles.chartCard}>
                    <h2 className={styles.chartTitle}>Resolved by Staff</h2>
                    {loading ? (
                        <div className={`${styles.skeleton} ${styles.skeletonChart}`} />
                    ) : (
                        <div className={styles.cssBarChart}>
                            {topPerformers.slice(0, 5).map(staff => (
                                <div key={staff.id} className={styles.cssBarRow}>
                                    <div className={styles.cssBarLabel}>
                                        <span>{staff.name}</span>
                                        <span>{staff.resolvedCount}</span>
                                    </div>
                                    <div className={styles.cssBarTrack}>
                                        <div className={styles.cssBarFill} style={{ width: `${staff.percentageVal}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className={styles.chartCard}>
                    <h2 className={styles.chartTitle}>Ticket Volume Trend</h2>
                    {loading ? (
                        <div className={`${styles.skeleton} ${styles.skeletonChart}`} />
                    ) : (
                        <div className={styles.chartPlaceholder}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                <LineChartIcon />
                                <span>Line Chart Library Placeholder (e.g., Recharts)</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Table Area */}
            <div className={styles.tableCard}>
                <div className={styles.tableHeader}>
                    <h2 className={styles.chartTitle} style={{ marginBottom: 0 }}>Top Performers Overview</h2>
                </div>
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Staff Member</th>
                                <th>Tickets Resolved</th>
                                <th>Avg CSAT</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                [...Array(3)].map((_, i) => (
                                    <tr key={i}>
                                        <td><div className={`${styles.skeleton} ${styles.skeletonText}`} /></td>
                                        <td><div className={`${styles.skeleton} ${styles.skeletonText}`} /></td>
                                        <td><div className={`${styles.skeleton} ${styles.skeletonText}`} /></td>
                                        <td><div className={`${styles.skeleton} ${styles.skeletonText}`} /></td>
                                    </tr>
                                ))
                            ) : (
                                topPerformers.map(staff => (
                                    <tr key={staff.id} className={styles.tableRow}>
                                        <td style={{ fontWeight: 500, color: 'var(--text)' }}>{staff.name}</td>
                                        <td>{staff.resolvedCount}</td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                <span style={{ color: '#f59e0b' }}>★</span>
                                                {staff.avgCsat.toFixed(1)}
                                            </div>
                                        </td>
                                        <td>
                                            <span style={{ color: '#166534', background: '#dcfce3', padding: '0.25rem 0.5rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 }}>
                                                Active
                                            </span>
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
