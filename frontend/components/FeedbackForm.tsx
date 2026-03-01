"use client";

import React, { useState, FormEvent } from "react";
import styles from "./feedback.module.css";

const MAX_COMMENT_LENGTH = 500;

export interface FeedbackData {
    rating: number;
    comment: string;
}

export interface FeedbackFormProps {
    ticketId: string;
    onSubmit: (data: FeedbackData) => Promise<void>;
    initialData?: FeedbackData; // If already submitted previously
}

const StarIcon = ({ filled, className = "" }: { filled: boolean; className?: string }) => (
    <svg
        viewBox="0 0 24 24"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`${styles.starIcon} ${filled ? styles.starFilled : styles.starEmpty} ${className}`}
        aria-hidden
    >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
);

const CheckIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

export function FeedbackForm({ ticketId, onSubmit, initialData }: FeedbackFormProps) {
    const [rating, setRating] = useState(initialData?.rating || 0);
    const [hoverRating, setHoverRating] = useState(0);
    const [comment, setComment] = useState(initialData?.comment || "");

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(!!initialData);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (rating === 0) return;

        setIsSubmitting(true);
        setError(null);

        try {
            await onSubmit({ rating, comment: comment.trim() });
            setIsSubmitted(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to submit feedback.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSubmitted) {
        return (
            <div className={styles.container}>
                <div className={styles.successState}>
                    <div className={styles.successIcon}>
                        <CheckIcon />
                    </div>
                    <h3 className={styles.successTitle}>Thank you for your feedback!</h3>
                    <p className={styles.successDesc}>Your rating helps us improve our service.</p>

                    <div className={styles.successStars} aria-label={`Rated ${rating} out of 5 stars`}>
                        {[1, 2, 3, 4, 5].map((star) => (
                            <StarIcon key={star} filled={star <= rating} />
                        ))}
                    </div>

                    {comment && (
                        <div style={{ marginTop: '1rem', fontStyle: 'italic', color: 'var(--muted)', fontSize: '0.9rem', maxWidth: '100%', wordBreak: 'break-word' }}>
                            "{comment}"
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <h3 className={styles.title}>How did we do?</h3>
            <p className={styles.subtitle}>Please rate your experience with resolving ticket {ticketId}.</p>

            <form onSubmit={handleSubmit}>
                <div
                    className={styles.starsContainer}
                    role="radiogroup"
                    aria-label="Star rating out of 5"
                >
                    {[1, 2, 3, 4, 5].map((star) => (
                        <button
                            key={star}
                            type="button"
                            className={styles.starBtn}
                            onClick={() => setRating(star)}
                            onMouseEnter={() => setHoverRating(star)}
                            onMouseLeave={() => setHoverRating(0)}
                            aria-checked={rating === star}
                            role="radio"
                            aria-label={`${star} star${star === 1 ? '' : 's'}`}
                        >
                            <StarIcon filled={star <= (hoverRating || rating)} />
                        </button>
                    ))}
                </div>

                <div className={styles.formGroup}>
                    <label htmlFor="feedback-comment" className={styles.label}>
                        Additional Comments (Optional)
                        <span className={`${styles.charCount} ${comment.length > MAX_COMMENT_LENGTH - 50 ? styles.charCountWarn : ''}`}>
                            {comment.length}/{MAX_COMMENT_LENGTH}
                        </span>
                    </label>
                    <textarea
                        id="feedback-comment"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        maxLength={MAX_COMMENT_LENGTH}
                        placeholder="Tell us what went well or how we can improve..."
                        className={styles.textarea}
                        disabled={isSubmitting}
                    />
                </div>

                <button
                    type="submit"
                    className={styles.btnPrimary}
                    disabled={rating === 0 || isSubmitting}
                >
                    {isSubmitting ? (
                        <><span className={styles.spinner} /> Submitting...</>
                    ) : (
                        "Submit Feedback"
                    )}
                </button>

                {error && <div className={styles.errorText}>{error}</div>}
            </form>
        </div>
    );
}
