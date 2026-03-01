"use client";

import React, { useState, useEffect, useMemo, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient as createSupabaseClient } from "@/utils/supabase/client";
import { FileUpload } from "@/components/FileUpload";
import styles from "./submit.module.css";

const TITLE_MAX_LENGTH = 120;
const DESCRIPTION_MIN_LENGTH = 20;
const DESCRIPTION_MAX_LENGTH = 5000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CategoryOption = { id: string; name: string };
type CategoriesResponse = { ok?: boolean; categories?: Array<{ id?: unknown; name?: unknown }> };
type TicketCreateResponse = { error?: string; details?: string; accessToken?: string; ticket?: { id?: string; reference?: string } };

export default function SubmitPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseClient(), []);

  // Form State
  const [step, setStep] = useState(1);
  const [guestEmail, setGuestEmail] = useState("");
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  // Validation State (touched fields)
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Meta State
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Success State
  const [successData, setSuccessData] = useState<{ trackingNumber: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadInitialData() {
      setLoadingInitial(true);
      const [authResult, categoriesResult] = await Promise.all([
        supabase.auth.getUser(),
        fetch("/api/categories", { cache: "no-store" }).catch(() => null),
      ]);
      if (cancelled) return;

      setAuthUserId(authResult.data.user?.id ?? null);
      // Skip email step if logged in
      if (authResult.data.user?.id) {
        setStep(2);
      }

      if (categoriesResult?.ok) {
        const payload = (await categoriesResult.json()) as CategoriesResponse;
        const nextCategories = (payload.categories ?? [])
          .map((entry) => {
            const id = typeof entry.id === "string" ? entry.id : null;
            const name = typeof entry.name === "string" ? entry.name : null;
            return id && name ? { id, name } : null;
          })
          .filter((e): e is CategoryOption => e !== null);
        setCategories(nextCategories);
      }
      setLoadingInitial(false);
    }
    void loadInitialData();
    return () => { cancelled = true; };
  }, [supabase]);

  // Validators
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!authUserId && guestEmail) {
      if (!EMAIL_REGEX.test(guestEmail)) e.guestEmail = "Invalid email format.";
    } else if (!authUserId && touched.guestEmail) {
      e.guestEmail = "Email is required for guests.";
    }

    if (touched.title) {
      if (!title.trim()) e.title = "Title is required.";
      else if (title.trim().length > TITLE_MAX_LENGTH) e.title = `Max ${TITLE_MAX_LENGTH} characters.`;
    }

    if (touched.description) {
      if (!description.trim()) e.description = "Description is required.";
      else if (description.trim().length < DESCRIPTION_MIN_LENGTH) e.description = `Min ${DESCRIPTION_MIN_LENGTH} characters.`;
      else if (description.trim().length > DESCRIPTION_MAX_LENGTH) e.description = `Max ${DESCRIPTION_MAX_LENGTH} characters.`;
    }

    if (touched.category && !categoryId) {
      e.category = "Please select a category.";
    }

    return e;
  }, [guestEmail, title, description, categoryId, touched, authUserId]);

  const handleBlur = (field: string) => setTouched((t) => ({ ...t, [field]: true }));

  const nextStep = () => {
    if (step === 1 && !authUserId) {
      setTouched((t) => ({ ...t, guestEmail: true }));
      if (!guestEmail || errors.guestEmail) return;
    }
    if (step === 2) {
      setTouched((t) => ({ ...t, title: true, description: true, category: true }));
      if (!title || !description || !categoryId || errors.title || errors.description || errors.category) return;
    }
    setStep(s => s + 1);
  };

  const prevStep = () => {
    // Don't let logged-in users go back to guest email step
    if (step === 2 && authUserId) return;
    setStep(s => Math.max(1, s - 1));
  };

  async function onSubmit() {
    if (isSubmitting) return;
    setSubmitError(null);
    setIsSubmitting(true);

    const payload = new FormData();
    payload.set("title", title.trim());
    payload.set("description", description.trim());
    payload.set("ticketType", "Complaint");
    payload.set("categoryId", categoryId);

    if (!authUserId) {
      payload.set("guestEmail", guestEmail.trim().toLowerCase());
    }

    for (const file of files) {
      payload.append("attachments", file, file.name);
    }

    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        body: payload,
      });

      const data = (await response.json()) as TicketCreateResponse;

      if (!response.ok) {
        throw new Error(data.error || data.details || "Failed to submit complaint.");
      }

      const ticketId = data.ticket?.id;
      const token = data.accessToken;

      if (!ticketId) {
        throw new Error("Invalid response from server.");
      }

      // For authenticated users, no access token is returned — redirect to tickets
      if (authUserId && !token) {
        router.push("/tickets");
        return;
      }

      // For guest users, show the success screen with token
      if (!token) {
        throw new Error("No access token received. Please contact support.");
      }

      setSuccessData({ trackingNumber: token });
      setStep(5); // Success step
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit complaint.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const copyToken = () => {
    if (successData) {
      navigator.clipboard.writeText(successData.trackingNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const renderStepProgress = () => {
    const steps = [
      { num: 1, label: "Your Details" },
      { num: 2, label: "Complaint" },
      { num: 3, label: "Attachments" },
      { num: 4, label: "Review" }
    ];

    return (
      <div className={styles.stepper} aria-label="Progress">
        <div className={styles.stepperProgress} style={{ width: `${((step - 1) / 3) * 100}%` }} />
        {steps.map(s => (
          <div key={s.num} className={`${styles.step} ${step === s.num ? styles.stepActive : ''} ${step > s.num ? styles.stepCompleted : ''}`}>
            <div className={styles.stepCircle}>{step > s.num ? "✓" : s.num}</div>
            <div className={styles.stepLabel}>{s.label}</div>
          </div>
        ))}
      </div>
    );
  };

  if (loadingInitial) {
    return (
      <div className={styles.container}>
        <div className={styles.card} style={{ textAlign: "center" }}>
          <div className={styles.spinner} style={{ borderColor: "var(--accent)", borderTopColor: "transparent", margin: "0 auto 1rem" }} />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <main className={styles.container}>
      <div className={styles.card}>

        {step < 5 && (
          <>
            <header className={styles.header}>
              <div className={styles.headerIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              </div>
              <h1>Submit a Complaint</h1>
              <p>We'll review your complaint and get back to you.</p>
            </header>
            {renderStepProgress()}
          </>
        )}

        {submitError && step < 5 && (
          <div className={styles.errorMessage} style={{ marginBottom: '1.5rem', padding: '1rem', background: '#fef2f2', borderRadius: '0.5rem' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            {submitError}
          </div>
        )}

        {/* STEP 1: Details (Guest Only) */}
        {step === 1 && !authUserId && (
          <div className="step-content">
            <div className={styles.formGroup}>
              <label htmlFor="email" className={styles.label}>Email Address</label>
              <input
                id="email"
                type="email"
                value={guestEmail}
                onChange={e => setGuestEmail(e.target.value)}
                onBlur={() => handleBlur("guestEmail")}
                placeholder="you@example.com"
                className={`${styles.input} ${touched.guestEmail ? (errors.guestEmail ? styles.inputError : styles.inputValid) : ''}`}
              />
              {touched.guestEmail && errors.guestEmail && (
                <span className={styles.errorMessage}>{errors.guestEmail}</span>
              )}
            </div>
            <div className={styles.buttonGroup}>
              <button type="button" onClick={() => router.push("/")} className={styles.btnSecondary}>Cancel</button>
              <button type="button" onClick={nextStep} className={styles.btnPrimary}>Continue</button>
            </div>
          </div>
        )}

        {/* STEP 2: Complaint Details */}
        {step === 2 && (
          <div className="step-content">
            <div className={styles.formGroup}>
              <label htmlFor="categoryId" className={styles.label}>Category</label>
              <select
                id="categoryId"
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                onBlur={() => handleBlur("category")}
                className={`${styles.input} ${touched.category ? (errors.category ? styles.inputError : styles.inputValid) : ''}`}
              >
                <option value="">Select a category...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {touched.category && errors.category && <span className={styles.errorMessage}>{errors.category}</span>}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="title" className={styles.label}>
                Title
                <span className={`${styles.charCount} ${title.length > TITLE_MAX_LENGTH ? styles.charCountWarn : ''}`}>
                  {TITLE_MAX_LENGTH - title.length}
                </span>
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                onBlur={() => handleBlur("title")}
                placeholder="Brief summary of the issue"
                maxLength={TITLE_MAX_LENGTH}
                className={`${styles.input} ${touched.title ? (errors.title ? styles.inputError : styles.inputValid) : ''}`}
              />
              {touched.title && errors.title && <span className={styles.errorMessage}>{errors.title}</span>}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="description" className={styles.label}>
                Description
                <span className={`${styles.charCount} ${description.length > DESCRIPTION_MAX_LENGTH - 100 ? styles.charCountWarn : ''}`}>
                  {description.length}/{DESCRIPTION_MAX_LENGTH}
                </span>
              </label>
              <textarea
                id="description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                onBlur={() => handleBlur("description")}
                placeholder="Please describe your complaint in detail..."
                rows={6}
                maxLength={DESCRIPTION_MAX_LENGTH}
                className={`${styles.input} ${touched.description ? (errors.description ? styles.inputError : styles.inputValid) : ''}`}
                style={{ resize: "vertical" }}
              />
              {touched.description && errors.description && <span className={styles.errorMessage}>{errors.description}</span>}
            </div>

            <div className={styles.buttonGroup}>
              <button type="button" onClick={prevStep} className={styles.btnSecondary}>Back</button>
              <button type="button" onClick={nextStep} className={styles.btnPrimary}>Continue</button>
            </div>
          </div>
        )}

        {/* STEP 3: Attachments */}
        {step === 3 && (
          <div className="step-content">
            <div className={styles.formGroup}>
              <label className={styles.label}>Supporting Documents (Optional)</label>
              <FileUpload files={files} onChange={setFiles} />
            </div>
            <div className={styles.buttonGroup}>
              <button type="button" onClick={prevStep} className={styles.btnSecondary}>Back</button>
              <button type="button" onClick={nextStep} className={styles.btnPrimary}>Continue</button>
            </div>
          </div>
        )}

        {/* STEP 4: Review */}
        {step === 4 && (
          <div className="step-content">
            <div className={styles.summaryBox}>
              {!authUserId && (
                <div className={styles.summaryItem}>
                  <div className={styles.summaryLabel}>Email</div>
                  <div className={styles.summaryValue}>{guestEmail}</div>
                </div>
              )}
              <div className={styles.summaryItem}>
                <div className={styles.summaryLabel}>Category</div>
                <div className={styles.summaryValue}>{categories.find(c => c.id === categoryId)?.name}</div>
              </div>
              <div className={styles.summaryItem}>
                <div className={styles.summaryLabel}>Title</div>
                <div className={styles.summaryValue}>{title}</div>
              </div>
              <div className={styles.summaryItem}>
                <div className={styles.summaryLabel}>Description</div>
                <div className={styles.summaryValue}>{description.substring(0, 150)}{description.length > 150 ? "..." : ""}</div>
              </div>
              <div className={styles.summaryItem}>
                <div className={styles.summaryLabel}>Attachments</div>
                <div className={styles.summaryValue}>{files.length} file(s)</div>
              </div>
            </div>

            <div className={styles.buttonGroup}>
              <button type="button" onClick={prevStep} className={styles.btnSecondary} disabled={isSubmitting}>Back</button>
              <button type="button" onClick={onSubmit} className={styles.btnPrimary} disabled={isSubmitting}>
                {isSubmitting ? <><span className={styles.spinner} /> Submitting...</> : "Submit Complaint"}
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: Success */}
        {step === 5 && successData && (
          <div className={styles.successContainer}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.successIcon}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <h2 className={styles.successTitle}>Complaint Submitted</h2>
            <p className={styles.successDesc}>Your complaint has been successfully recorded.</p>

            <div className={styles.ticketRefBox}>
              <div className={styles.ticketRefLabel}>Tracking Number</div>
              <div className={styles.ticketRefValue}>{successData.trackingNumber}</div>
            </div>

            <div className={styles.tokenBox}>
              <input type="text" value={successData.trackingNumber} readOnly className={styles.tokenInput} />
              <button onClick={copyToken} className={styles.copyBtn}>{copied ? "Copied!" : "Copy Number"}</button>
            </div>

            <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "2rem" }}>
              Please save this tracking number. You will need it to track your ticket status at <Link href="/track" style={{ color: "var(--accent)" }}>/track</Link>.
            </p>

            <div className={styles.buttonGroup}>
              <button onClick={() => { setStep(authUserId ? 2 : 1); setTitle(""); setDescription(""); setFiles([]); setGuestEmail(""); setSuccessData(null); }} className={styles.btnSecondary}>
                Submit Another
              </button>
              <Link href={`/track?token=${successData.trackingNumber}`} className={styles.btnPrimary} style={{ textDecoration: 'none' }}>
                Track Ticket
              </Link>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
