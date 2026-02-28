"use client";

import { useEffect, useState } from "react";

import AdminNav from "@/app/admin/AdminNav";
import type {
  AdminCategoriesResponse,
  AdminComplaintCategory,
  AdminCreateCategoryResponse,
  AdminUpdateCategoryResponse,
} from "@/types/admin-ops";

import styles from "../admin.module.css";

type ApiErrorPayload = { error?: string; message?: string };

function formatDateTime(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function sortCategories(categories: AdminComplaintCategory[]) {
  return [...categories].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

async function readApiError(response: Response) {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    return payload.message || payload.error || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export default function AdminCategoriesClient() {
  const [categories, setCategories] = useState<AdminComplaintCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [createName, setCreateName] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createMessage, setCreateMessage] = useState<string | null>(null);

  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});
  const [rowSubmittingId, setRowSubmittingId] = useState<string | null>(null);
  const [rowErrorById, setRowErrorById] = useState<Record<string, string>>({});
  const [rowMessageById, setRowMessageById] = useState<Record<string, string>>({});

  const activeCount = categories.reduce((total, category) => total + (category.isActive ? 1 : 0), 0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCategories() {
      setLoading(true);
      setLoadError(null);

      try {
        const response = await fetch("/api/admin/categories", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(await readApiError(response));
        }

        const payload = (await response.json()) as AdminCategoriesResponse;
        const nextCategories = sortCategories(Array.isArray(payload.categories) ? payload.categories : []);
        setCategories(nextCategories);
        setRenameDrafts((prev) => {
          const next: Record<string, string> = {};
          for (const category of nextCategories) {
            next[category.id] = prev[category.id] ?? category.name;
          }
          return next;
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setLoadError(error instanceof Error ? error.message : "Failed to load categories.");
      } finally {
        setLoading(false);
      }
    }

    void loadCategories();
    return () => controller.abort();
  }, []);

  function applyUpdatedCategory(updated: AdminComplaintCategory, message?: string) {
    setCategories((prev) => sortCategories(prev.map((item) => (item.id === updated.id ? updated : item))));
    setRenameDrafts((prev) => ({ ...prev, [updated.id]: updated.name }));
    setRowErrorById((prev) => {
      const next = { ...prev };
      delete next[updated.id];
      return next;
    });
    if (message) {
      setRowMessageById((prev) => ({ ...prev, [updated.id]: message }));
    }
  }

  async function handleCreateCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateSubmitting(true);
    setCreateError(null);
    setCreateMessage(null);

    try {
      const response = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryName: createName }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = (await response.json()) as AdminCreateCategoryResponse;
      setCategories((prev) => sortCategories([payload.category, ...prev]));
      setRenameDrafts((prev) => ({ ...prev, [payload.category.id]: payload.category.name }));
      setCreateName("");
      setCreateMessage(payload.message || "Category created successfully.");
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Failed to create category.");
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleRename(category: AdminComplaintCategory) {
    const draftName = (renameDrafts[category.id] ?? "").trim();
    setRowSubmittingId(category.id);
    setRowErrorById((prev) => ({ ...prev, [category.id]: "" }));
    setRowMessageById((prev) => ({ ...prev, [category.id]: "" }));

    try {
      const response = await fetch(`/api/admin/categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryName: draftName }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = (await response.json()) as AdminUpdateCategoryResponse;
      applyUpdatedCategory(payload.category, payload.message);
    } catch (error) {
      setRowErrorById((prev) => ({
        ...prev,
        [category.id]: error instanceof Error ? error.message : "Failed to rename category.",
      }));
    } finally {
      setRowSubmittingId((current) => (current === category.id ? null : current));
    }
  }

  async function handleToggleCategory(category: AdminComplaintCategory, nextIsActive: boolean) {
    setRowSubmittingId(category.id);
    setRowErrorById((prev) => ({ ...prev, [category.id]: "" }));
    setRowMessageById((prev) => ({ ...prev, [category.id]: "" }));

    try {
      const response = await fetch(`/api/admin/categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextIsActive }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = (await response.json()) as AdminUpdateCategoryResponse;
      applyUpdatedCategory(payload.category, payload.message);
    } catch (error) {
      setRowErrorById((prev) => ({
        ...prev,
        [category.id]: error instanceof Error ? error.message : "Failed to update category status.",
      }));
    } finally {
      setRowSubmittingId((current) => (current === category.id ? null : current));
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.headerCard}>
        <div className={styles.headerTop}>
          <div className={styles.titleWrap}>
            <h1 className={styles.title}>Category Management</h1>
            <p className={styles.subtitle}>
              Manage complaint categories used during ticket submission. Active categories remain available to
              customers and staff workflows.
            </p>
            <p className={styles.metaText}>
              {categories.length} total categories, {activeCount} active
            </p>
          </div>

          <AdminNav />
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Create Category</h2>
          <p className={styles.cardSubtitle}>
            New categories are created as active by default and immediately available for ticket submission.
          </p>
        </div>

        <form className={styles.inlineForm} onSubmit={handleCreateCategory}>
          <label className={styles.field} style={{ flex: "1 1 260px" }}>
            <span className={styles.fieldLabel}>Category name</span>
            <input
              type="text"
              className={styles.input}
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="e.g. Billing Dispute"
              maxLength={80}
              required
            />
          </label>
          <button type="submit" className={styles.buttonPrimary} disabled={createSubmitting}>
            {createSubmitting ? "Creating..." : "Create Category"}
          </button>
        </form>

        {createError ? <p className={styles.errorText}>{createError}</p> : null}
        {createMessage ? <p className={styles.successText}>{createMessage}</p> : null}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Categories</h2>
          <p className={styles.cardSubtitle}>
            Rename categories and toggle active status. The last active category cannot be deactivated.
          </p>
        </div>

        {loading ? <p className={styles.stateText}>Loading categories...</p> : null}
        {!loading && loadError ? <p className={styles.errorText}>{loadError}</p> : null}

        {!loading && !loadError && categories.length === 0 ? (
          <div className={styles.emptyPanel}>
            <p className={styles.stateText}>No complaint categories found yet.</p>
          </div>
        ) : null}

        {!loading && !loadError && categories.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => {
                  const isBusy = rowSubmittingId === category.id;
                  const canDeactivate = !(category.isActive && activeCount <= 1);

                  return (
                    <tr key={category.id}>
                      <td>
                        <div className={styles.cellStack}>
                          <input
                            type="text"
                            className={styles.input}
                            value={renameDrafts[category.id] ?? category.name}
                            maxLength={80}
                            onChange={(event) =>
                              setRenameDrafts((prev) => ({ ...prev, [category.id]: event.target.value }))
                            }
                            aria-label={`Rename ${category.name}`}
                            disabled={isBusy}
                          />
                          <code className={styles.codeInline}>{category.id}</code>
                          {rowErrorById[category.id] ? (
                            <span className={styles.errorText}>{rowErrorById[category.id]}</span>
                          ) : null}
                          {rowMessageById[category.id] ? (
                            <span className={styles.successText}>{rowMessageById[category.id]}</span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`${styles.badge} ${category.isActive ? styles.badgeSuccess : styles.badgeMuted}`}
                        >
                          {category.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className={styles.tableCellMuted}>{formatDateTime(category.updatedAt)}</td>
                      <td className={styles.tableCellMuted}>{formatDateTime(category.createdAt)}</td>
                      <td>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.buttonSecondary}
                            disabled={isBusy}
                            onClick={() => void handleRename(category)}
                          >
                            {isBusy ? "Saving..." : "Save Name"}
                          </button>
                          <button
                            type="button"
                            className={category.isActive ? styles.buttonDanger : styles.buttonGhost}
                            disabled={isBusy || (category.isActive && !canDeactivate)}
                            onClick={() => void handleToggleCategory(category, !category.isActive)}
                            title={
                              category.isActive && !canDeactivate
                                ? "At least one active category is required."
                                : undefined
                            }
                          >
                            {category.isActive ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}
