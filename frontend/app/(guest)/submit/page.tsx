"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { FileUpload } from "@/components/FileUpload";
import styles from "@/components/features/guest/submit/submit.module.css";
import { createClient as createSupabaseClient } from "@/utils/supabase/client";

const TITLE_MAX_LENGTH = 120;
const DESCRIPTION_MIN_LENGTH = 20;
const DESCRIPTION_MAX_LENGTH = 5000;
const NOT_SURE_CATEGORY = "__NOT_SURE__";

type CategoryOption = { id: string; name: string };
type CategoriesResponse = {
  ok?: boolean;
  categories?: Array<{ id?: unknown; name?: unknown }>;
};
type TicketCreateResponse = {
  error?: string;
  details?: string;
  ticket?: { id?: string; reference?: string };
};

export default function SubmitPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseClient(), []);

  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState(NOT_SURE_CATEGORY);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      setLoadingInitial(true);

      const [authResult, categoriesResult] = await Promise.all([
        supabase.auth.getUser(),
        fetch("/api/categories", { cache: "no-store" }).catch(() => null),
      ]);

      if (cancelled) return;

      const nextUserId = authResult.data.user?.id ?? null;
      setAuthUserId(nextUserId);

      if (!nextUserId) {
        router.replace("/login?next=/submit");
        return;
      }

      if (categoriesResult?.ok) {
        const payload = (await categoriesResult.json()) as CategoriesResponse;
        const nextCategories = (payload.categories ?? [])
          .map((entry) => {
            const id = typeof entry.id === "string" ? entry.id : null;
            const name = typeof entry.name === "string" ? entry.name : null;
            return id && name ? { id, name } : null;
          })
          .filter((entry): entry is CategoryOption => entry !== null);

        setCategories(nextCategories);
      }

      setLoadingInitial(false);
    }

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  const errors = useMemo(() => {
    const nextErrors: Record<string, string> = {};

    if (touched.title) {
      if (!title.trim()) nextErrors.title = "Title is required.";
      else if (title.trim().length > TITLE_MAX_LENGTH) nextErrors.title = `Max ${TITLE_MAX_LENGTH} characters.`;
    }

    if (touched.description) {
      if (!description.trim()) nextErrors.description = "Description is required.";
      else if (description.trim().length < DESCRIPTION_MIN_LENGTH) {
        nextErrors.description = `Min ${DESCRIPTION_MIN_LENGTH} characters.`;
      } else if (description.trim().length > DESCRIPTION_MAX_LENGTH) {
        nextErrors.description = `Max ${DESCRIPTION_MAX_LENGTH} characters.`;
      }
    }

    return nextErrors;
  }, [description, title, touched]);

  const handleBlur = (field: string) => {
    setTouched((current) => ({ ...current, [field]: true }));
  };

  const nextStep = () => {
    if (step === 1) {
      setTouched((current) => ({
        ...current,
        title: true,
        description: true,
      }));

      if (!title || !description || errors.title || errors.description) {
        return;
      }
    }

    setStep((current) => current + 1);
  };

  const prevStep = () => {
    setStep((current) => Math.max(1, current - 1));
  };

  async function onSubmit() {
    if (isSubmitting) return;

    setSubmitError(null);
    setIsSubmitting(true);

    const payload = new FormData();
    payload.set("title", title.trim());
    payload.set("description", description.trim());
    payload.set("ticketType", "Complaint");
    if (categoryId && categoryId !== NOT_SURE_CATEGORY) {
      payload.set("categoryId", categoryId);
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

      if (!data.ticket?.id) {
        throw new Error("Invalid response from server.");
      }

      router.push("/tickets");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to submit complaint.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const renderStepProgress = () => {
    const steps = [
      { num: 1, label: "Complaint" },
      { num: 2, label: "Attachments" },
      { num: 3, label: "Review" },
    ];

    return (
      <div className={styles.stepper} aria-label="Progress">
        <div className={styles.stepperProgress} style={{ width: `${((step - 1) / 2) * 100}%` }} />
        {steps.map((entry) => (
          <div
            key={entry.num}
            className={`${styles.step} ${step === entry.num ? styles.stepActive : ""} ${step > entry.num ? styles.stepCompleted : ""}`}
          >
            <div className={styles.stepCircle}>{step > entry.num ? "OK" : entry.num}</div>
            <div className={styles.stepLabel}>{entry.label}</div>
          </div>
        ))}
      </div>
    );
  };

  if (loadingInitial) {
    return (
      <main className="glass-shell">
        <div className="glass-shell-word" aria-hidden="true">
          INSIGHTA
        </div>
        <section className="glass-shell-panel glass-shell-panel--wide">
          <div className={styles.container}>
            <div className={styles.card} style={{ textAlign: "center" }}>
              <div
                className={styles.spinner}
                style={{ borderColor: "var(--accent)", borderTopColor: "transparent", margin: "0 auto 1rem" }}
              />
              <p>Loading...</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!authUserId) {
    return (
      <div className={styles.container}>
        <div className={styles.card} style={{ textAlign: "center" }}>
          <div
            className={styles.spinner}
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent", margin: "0 auto 1rem" }}
          />
          <p>Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="glass-shell">
      <div className="glass-shell-word" aria-hidden="true">
        INSIGHTA
      </div>
      <section className="glass-shell-panel glass-shell-panel--wide">
        <div className={styles.container}>
          <div className={styles.card}>
            <header className={styles.header}>
              <div className={styles.headerIcon}>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <h1>Submit a Complaint</h1>
              <p>Signed-in users only.</p>
            </header>

            {renderStepProgress()}

            {submitError ? (
              <div className={styles.errorMessage} style={{ marginBottom: "1.5rem", padding: "1rem", background: "#fef2f2", borderRadius: "0.5rem" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {submitError}
              </div>
            ) : null}

            {step === 1 ? (
              <div className="step-content">
                <div className={styles.formGroup}>
                  <label htmlFor="categoryId" className={styles.label}>Category (optional)</label>
                  <select
                    id="categoryId"
                    value={categoryId}
                    onChange={(event) => setCategoryId(event.target.value)}
                    className={styles.input}
                  >
                    <option value={NOT_SURE_CATEGORY}>Not sure (let AI classify)</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="title" className={styles.label}>
                    Title
                    <span className={`${styles.charCount} ${title.length > TITLE_MAX_LENGTH ? styles.charCountWarn : ""}`}>
                      {TITLE_MAX_LENGTH - title.length}
                    </span>
                  </label>
                  <input
                    id="title"
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    onBlur={() => handleBlur("title")}
                    placeholder="Brief summary of the issue"
                    maxLength={TITLE_MAX_LENGTH}
                    className={`${styles.input} ${touched.title ? (errors.title ? styles.inputError : styles.inputValid) : ""}`}
                  />
                  {touched.title && errors.title ? <span className={styles.errorMessage}>{errors.title}</span> : null}
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="description" className={styles.label}>
                    Description
                    <span className={`${styles.charCount} ${description.length > DESCRIPTION_MAX_LENGTH - 100 ? styles.charCountWarn : ""}`}>
                      {description.length}/{DESCRIPTION_MAX_LENGTH}
                    </span>
                  </label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    onBlur={() => handleBlur("description")}
                    placeholder="Please describe your complaint in detail..."
                    rows={6}
                    maxLength={DESCRIPTION_MAX_LENGTH}
                    className={`${styles.input} ${touched.description ? (errors.description ? styles.inputError : styles.inputValid) : ""}`}
                    style={{ resize: "vertical" }}
                  />
                  {touched.description && errors.description ? <span className={styles.errorMessage}>{errors.description}</span> : null}
                </div>

                <div className={styles.buttonGroup}>
                  <button type="button" onClick={() => router.push("/")} className={styles.btnSecondary}>Cancel</button>
                  <button type="button" onClick={nextStep} className={styles.btnPrimary}>Continue</button>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
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
            ) : null}

            {step === 3 ? (
              <div className="step-content">
                <div className={styles.summaryBox}>
                  <div className={styles.summaryItem}>
                    <div className={styles.summaryLabel}>Category</div>
                    <div className={styles.summaryValue}>
                      {categoryId === NOT_SURE_CATEGORY
                        ? "Not sure (let AI classify)"
                        : (categories.find((category) => category.id === categoryId)?.name ?? "Not sure (let AI classify)")}
                    </div>
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
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
