"use client";

import React, { useState, useRef, useEffect, ChangeEvent } from "react";
import styles from "./message-thread.module.css";
import { UserRole } from "@/types/auth";

export interface MessageAttachment {
    id: string;
    filename: string;
    url: string;
    filetype: string;
}

export interface ThreadMessage {
    id: string;
    content: string;
    created_at: string;
    author: {
        name: string;
        role: "Customer" | "Staff" | "Admin";
        avatarUrl?: string;
    };
    attachments?: MessageAttachment[];
}

export interface MessageThreadProps {
    messages: ThreadMessage[];
    currentUserId: string; // Used to identify if message is from "me" or to apply role-based styling
    currentUserRole: UserRole;
    onSendMessage: (content: string, attachments?: File[]) => Promise<void>;
    disabled?: boolean;
}

// Icons
const SendIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '2px' }} aria-hidden>
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
    </svg>
);

const PaperclipIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
    </svg>
);

const FileIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
        <polyline points="13 2 13 9 20 9"></polyline>
    </svg>
);

const XIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
);

// Helpers
function getInitials(name: string) {
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
}

function getRelativeTime(isoString: string) {
    const date = new Date(isoString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "Just now";

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;

    // Checking if it's the exact same day for "Today at HH:MM"
    if (date.toDateString() === now.toDateString()) {
        return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function MessageThread({
    messages,
    currentUserRole,
    onSendMessage,
    disabled = false,
}: MessageThreadProps) {
    const [inputText, setInputText] = useState("");
    const [stagedFiles, setStagedFiles] = useState<File[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files);
            setStagedFiles(prev => [...prev, ...newFiles].slice(0, 5)); // Limit to 5
        }
        // reset input
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const removeStagedFile = (idx: number) => {
        setStagedFiles(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSend = async () => {
        if ((!inputText.trim() && stagedFiles.length === 0) || isSubmitting) return;

        setIsSubmitting(true);
        try {
            await onSendMessage(inputText.trim(), stagedFiles);
            setInputText("");
            setStagedFiles([]);
        } catch (error) {
            console.error("Failed to send message:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.messageList} ref={scrollRef}>
                {messages.length === 0 ? (
                    <div className={styles.emptyState}>
                        No messages yet. Send a message to start the conversation.
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isCustomer = msg.author.role === "Customer";
                        const rowClass = isCustomer ? styles.messageRowCustomer : styles.messageRowStaff;
                        const bubbleClass = isCustomer ? styles.bubbleCustomer : styles.bubbleStaff;
                        const avatarClass = isCustomer ? styles.avatarCustomer : styles.avatarStaff;
                        const pillClass = isCustomer ? styles.attachmentPillCustomer : styles.attachmentPillStaff;

                        return (
                            <div key={msg.id} className={`${styles.messageRow} ${rowClass}`}>
                                <div className={styles.messageWrapper}>
                                    {/* Avatar */}
                                    <div className={`${styles.avatar} ${avatarClass}`} title={msg.author.role}>
                                        {msg.author.avatarUrl ? (
                                            <img src={msg.author.avatarUrl} alt="" className={styles.avatarImage} />
                                        ) : (
                                            getInitials(msg.author.name)
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className={styles.contentArea}>
                                        <div className={styles.meta}>
                                            <span className={styles.authorName}>{msg.author.name}</span>
                                            <span className={styles.timestamp}>{getRelativeTime(msg.created_at)}</span>
                                        </div>

                                        <div className={`${styles.bubble} ${bubbleClass}`}>
                                            {msg.content}
                                        </div>

                                        {msg.attachments && msg.attachments.length > 0 && (
                                            <div className={styles.attachmentList}>
                                                {msg.attachments.map(att => (
                                                    <a
                                                        key={att.id}
                                                        href={att.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className={`${styles.attachmentPill} ${pillClass}`}
                                                        title={att.filename}
                                                    >
                                                        <FileIcon />
                                                        <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {att.filename}
                                                        </span>
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <div className={styles.inputArea}>
                {stagedFiles.length > 0 && (
                    <div className={styles.stagedFiles}>
                        {stagedFiles.map((f, idx) => (
                            <div key={idx} className={styles.stagedFileLabel}>
                                <FileIcon />
                                <span style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                                <button type="button" onClick={() => removeStagedFile(idx)} className={styles.stagedFileRemove}>
                                    <XIcon />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className={styles.textareaWrapper}>
                    <input
                        type="file"
                        multiple
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        style={{ display: "none" }}
                        aria-hidden="true"
                    />
                    <button
                        type="button"
                        className={`${styles.btnAttach} ${stagedFiles.length > 0 ? styles.btnAttachActive : ''}`}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={disabled || isSubmitting || stagedFiles.length >= 5}
                        title="Attach files (max 5)"
                        aria-label="Attach files"
                    >
                        <PaperclipIcon />
                    </button>

                    <textarea
                        className={styles.textarea}
                        placeholder="Type a message... (Press Enter to send)"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={disabled || isSubmitting}
                        aria-label="Message content input"
                    />

                    <button
                        type="button"
                        className={styles.btnSend}
                        onClick={handleSend}
                        disabled={(!inputText.trim() && stagedFiles.length === 0) || disabled || isSubmitting}
                        aria-label="Send message"
                    >
                        {isSubmitting ? <span className={styles.spinner} /> : <SendIcon />}
                    </button>
                </div>
            </div>
        </div>
    );
}
