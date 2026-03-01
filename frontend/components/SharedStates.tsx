import React from "react";
import styles from "./shared-states.module.css";

// SVG Icons
const SearchXIcon = () => (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M19.5 19.5L14 14" />
        <circle cx="9.5" cy="9.5" r="5.5" />
        <path d="M13 13l4.5 4.5" />
    </svg>
);

const InboxIcon = () => (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
        <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
    </svg>
);

const AlertCircleIcon = () => (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
);


// 1. Loading State
interface LoadingStateProps {
    message?: string;
}

export function LoadingState({ message = "Loading..." }: LoadingStateProps) {
    return (
        <div className={styles.container}>
            <div className={styles.spinnerWrapper}>
                <div className={styles.spinner} role="status" aria-label="Loading"></div>
            </div>
            {message && <p className={styles.loadingText}>{message}</p>}
        </div>
    );
}


// 2. Empty State
interface EmptyStateProps {
    title?: string;
    description?: string;
    icon?: "inbox" | "search"; // Can add more variant strings if needed
    actionLabel?: string;
    onAction?: () => void;
}

export function EmptyState({
    title = "No data found",
    description = "There is nothing here at the moment.",
    icon = "inbox",
    actionLabel,
    onAction
}: EmptyStateProps) {
    return (
        <div className={styles.container}>
            <div className={styles.emptyIcon}>
                {icon === "inbox" ? <InboxIcon /> : <SearchXIcon />}
            </div>
            <h3 className={styles.emptyTitle}>{title}</h3>
            <p className={styles.emptyDesc}>{description}</p>

            {actionLabel && onAction && (
                <button type="button" className={styles.btnSecondary} onClick={onAction}>
                    {actionLabel}
                </button>
            )}
        </div>
    );
}


// 3. Error State
interface ErrorStateProps {
    title?: string;
    message?: string;
    onRetry?: () => void;
}

export function ErrorState({
    title = "Something went wrong",
    message = "We encountered an unexpected error while trying to load this data.",
    onRetry
}: ErrorStateProps) {
    return (
        <div className={styles.container}>
            <div className={styles.errorBox}>
                <div className={styles.errorIcon}>
                    <AlertCircleIcon />
                </div>
                <h3 className={styles.errorTitle}>{title}</h3>
                <p className={styles.errorDesc}>{message}</p>

                {onRetry && (
                    <button type="button" className={styles.btnDanger} onClick={onRetry}>
                        Try Again
                    </button>
                )}
            </div>
        </div>
    );
}
