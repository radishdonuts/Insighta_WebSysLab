"use client";

import React, { useState, FormEvent } from "react";
import styles from "./recovery.module.css";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Icons
const KeyIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
);

const CheckIcon = () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const AlertCircleIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
);

export function RecoveryFlow() {
    const [email, setEmail] = useState("");
    const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
    const [errorMessage, setErrorMessage] = useState("");

    const isValidEmail = EMAIL_REGEX.test(email.trim());

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!isValidEmail) return;

        setStatus("loading");
        setErrorMessage("");

        try {
            const res = await fetch("/api/tickets/recover", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim().toLowerCase() }),
            });

            if (!res.ok) {
                throw new Error("Failed to connect to the recovery service. Please try again.");
            }

            // We always show success even if email isn't found, to prevent enumeration
            setStatus("success");
        } catch (err) {
            setStatus("error");
            setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred.");
        }
    };

    const resetForm = () => {
        setEmail("");
        setStatus("idle");
        setErrorMessage("");
    };

    return (
        <div className={styles.card}>
            {status === "success" ? (
                <div className={styles.successState}>
                    <div className={styles.successIcon}>
                        <CheckIcon />
                    </div>
                    <h2 className={styles.title}>Email Sent</h2>
                    <p className={styles.successText}>
                        If a ticket matches <strong>{email}</strong>, a recovery link has been sent to your inbox. Please check your spam folder as well.
                    </p>
                    <button type="button" onClick={resetForm} className={styles.btnSecondary}>
                        Try another email
                    </button>
                </div>
            ) : (
                <>
                    <div className={styles.header}>
                        <div className={styles.icon}>
                            <KeyIcon />
                        </div>
                        <h2 className={styles.title}>Lost your access token?</h2>
                        <p className={styles.description}>
                            Enter the email address you used to submit the complaint, and we'll send you a secure recovery link.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div className={styles.formGroup}>
                            <label htmlFor="recovery-email" className={styles.label}>
                                Email Address
                            </label>
                            <input
                                id="recovery-email"
                                type="email"
                                value={email}
                                onChange={(e) => {
                                    setEmail(e.target.value);
                                    if (status === "error") setStatus("idle");
                                }}
                                disabled={status === "loading"}
                                placeholder="you@example.com"
                                className={styles.input}
                                required
                                autoComplete="email"
                            />
                            {status === "error" && (
                                <div className={styles.errorText}>
                                    <AlertCircleIcon /> {errorMessage}
                                </div>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={!isValidEmail || status === "loading"}
                            className={styles.btnPrimary}
                        >
                            {status === "loading" ? (
                                <>
                                    <span className={styles.spinner} /> Sending...
                                </>
                            ) : (
                                "Send Recovery Link"
                            )}
                        </button>
                    </form>
                </>
            )}
        </div>
    );
}
