"use client";

import React, { useState } from "react";
import styles from "./notes-timeline.module.css";

export interface NoteAuthor {
    name: string;
    avatarUrl?: string;
}

export interface InternalNote {
    id: string;
    content: string;
    created_at: string;
    author: NoteAuthor;
}

export interface NotesTimelineProps {
    notes: InternalNote[];
    onAddNote: (content: string) => Promise<void>;
    disabled?: boolean;
}

// Helper: Get Initials
function getInitials(name: string) {
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
}

// Helper: Format relative time
function getRelativeTime(isoString: string) {
    const date = new Date(isoString);
    const diffInSeconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "just now";

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;

    return date.toLocaleDateString();
}

const LockIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
);

export function NotesTimeline({ notes, onAddNote, disabled = false }: NotesTimelineProps) {
    const [newNote, setNewNote] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!newNote.trim() || isSubmitting) return;

        setIsSubmitting(true);
        try {
            await onAddNote(newNote.trim());
            setNewNote(""); // clear on success
        } catch (error) {
            console.error("Failed to add note:", error);
            // could handle error state here
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div className={styles.container}>
            {/* Editor always at the top for quick access */}
            <div className={styles.editorContainer}>
                <textarea
                    className={styles.textarea}
                    placeholder="Type an internal note... (Cmd/Ctrl + Enter to submit)"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={disabled || isSubmitting}
                    aria-label="New internal note"
                />
                <div className={styles.editorFooter}>
                    <div className={styles.editorHint}>
                        <LockIcon /> Staff only. Not visible to customers.
                    </div>
                    <button
                        type="button"
                        className={styles.btnPrimary}
                        onClick={handleSubmit}
                        disabled={!newNote.trim() || disabled || isSubmitting}
                    >
                        {isSubmitting ? (
                            <><span className={styles.spinner} /> Posting...</>
                        ) : "Post Note"}
                    </button>
                </div>
            </div>

            <div className={styles.timelineWrapper}>
                {notes.length === 0 ? (
                    <div className={styles.emptyState}>
                        No internal notes found for this ticket.
                    </div>
                ) : (
                    <div className={styles.timeline}>
                        {notes.map((note) => (
                            <div key={note.id} className={styles.noteItem}>
                                <div className={styles.noteBullet} />
                                <div className={styles.noteContent}>
                                    <div className={styles.noteHeader}>
                                        <div className={styles.authorInfo}>
                                            <div className={styles.avatar}>
                                                {note.author.avatarUrl ? (
                                                    <img src={note.author.avatarUrl} alt="" className={styles.avatarImage} />
                                                ) : (
                                                    getInitials(note.author.name)
                                                )}
                                            </div>
                                            <span className={styles.authorName}>{note.author.name}</span>
                                        </div>
                                        <span className={styles.time}>{getRelativeTime(note.created_at)}</span>
                                    </div>
                                    <pre className={styles.noteText}>{note.content}</pre>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
