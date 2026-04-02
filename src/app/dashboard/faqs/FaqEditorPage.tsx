"use client";

import { startTransition, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import DashboardShell from "../_components/DashboardShell";

type FaqEntry = {
  id: string;
  keywords: string[];
  answer: string;
  image_attachment_id?: string;
};

type NoticeState = {
  tone: "success" | "error";
  message: string;
};

const CRUD_ANIMATION_MS = 280;

async function fetchFaqEntries(clientId: string) {
  const response = await fetch(`/api/faqs/${encodeURIComponent(clientId)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(data?.error || "Failed to load FAQs");
  }

  return (await response.json()) as FaqEntry[];
}

const FaqEditorPage = () => {
  const searchParams = useSearchParams();
  const clientId = searchParams?.get("clientId") ?? "";
  const clientName = searchParams?.get("clientName") ?? "Selected Client";
  const [faqEntries, setFaqEntries] = useState<FaqEntry[]>([]);
  const [isLoadingFaqs, setIsLoadingFaqs] = useState(true);
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null);
  const [keywordsInput, setKeywordsInput] = useState("");
  const [answerInput, setAnswerInput] = useState("");
  const [imageIdInput, setImageIdInput] = useState("");
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [removingFaqId, setRemovingFaqId] = useState<string | null>(null);
  const [animatedFaqId, setAnimatedFaqId] = useState<string | null>(null);
  const [animatedFaqTone, setAnimatedFaqTone] = useState<"created" | "updated" | null>(null);

  useEffect(() => {
    const loadFaqs = async () => {
      if (!clientId) {
        setFaqEntries([]);
        setIsLoadingFaqs(false);
        return;
      }

      setIsLoadingFaqs(true);

      try {
        const data = await fetchFaqEntries(clientId);
        startTransition(() => {
          setFaqEntries(data);
        });
      } catch (error) {
        console.error(error);
        setFaqEntries([]);
        setNotice({
          tone: "error",
          message: error instanceof Error ? error.message : "Failed to load FAQs.",
        });
      } finally {
        setIsLoadingFaqs(false);
      }
    };

    void loadFaqs();
  }, [clientId]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setNotice(null);
    }, 3200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [notice]);

  useEffect(() => {
    if (!animatedFaqId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setAnimatedFaqId(null);
      setAnimatedFaqTone(null);
    }, 1600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [animatedFaqId]);

  const resetForm = () => {
    setEditingFaqId(null);
    setKeywordsInput("");
    setAnswerInput("");
    setImageIdInput("");
  };

  const handleSubmit = async () => {
    if (!clientId || !keywordsInput.trim() || !answerInput.trim()) {
      setNotice({
        tone: "error",
        message: "Keywords and answer are required.",
      });
      return;
    }

    setIsSubmitting(true);
    setNotice(null);

    const isUpdating = Boolean(editingFaqId);
    const payload = {
      keywords: keywordsInput
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean),
      answer: answerInput.trim(),
      image_attachment_id: imageIdInput.trim(),
    };

    try {
      const response = await fetch(`/api/faqs/${encodeURIComponent(clientId)}`, {
        method: isUpdating ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          isUpdating ? { faqId: editingFaqId, ...payload } : payload
        ),
      });

      const result = (await response.json().catch(() => null)) as
        | { error?: string; faqId?: string }
        | null;

      if (!response.ok) {
        throw new Error(result?.error || "Unable to save FAQ");
      }

      const refreshedFaqs = await fetchFaqEntries(clientId);
      startTransition(() => {
        setFaqEntries(refreshedFaqs);
      });
      resetForm();
      setAnimatedFaqId(result?.faqId ?? null);
      setAnimatedFaqTone(isUpdating ? "updated" : "created");
      setNotice({
        tone: "success",
        message: isUpdating ? "FAQ updated successfully." : "FAQ created successfully.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to save FAQ.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (entry: FaqEntry) => {
    setEditingFaqId(entry.id);
    setKeywordsInput(entry.keywords.join(", "));
    setAnswerInput(entry.answer);
    setImageIdInput(entry.image_attachment_id ?? "");
    setNotice(null);
  };

  const handleDelete = async (faqId: string) => {
    if (!clientId || removingFaqId) {
      return;
    }

    setNotice(null);
    setRemovingFaqId(faqId);

    try {
      await new Promise((resolve) => window.setTimeout(resolve, CRUD_ANIMATION_MS));

      const response = await fetch(
        `/api/faqs/${encodeURIComponent(clientId)}?faqId=${encodeURIComponent(faqId)}`,
        { method: "DELETE" }
      );

      const result = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(result?.error || "Unable to delete FAQ");
      }

      startTransition(() => {
        setFaqEntries((currentEntries) =>
          currentEntries.filter((entry) => entry.id !== faqId)
        );
      });

      if (editingFaqId === faqId) {
        resetForm();
      }

      setNotice({ tone: "success", message: "FAQ deleted successfully." });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to delete FAQ.",
      });
    } finally {
      setRemovingFaqId(null);
    }
  };

  return (
    <DashboardShell activeNav="Clients" searchPlaceholder="Search FAQs...">
      <div className="flex flex-col gap-7">
        <div className="max-w-[760px]">
          <div className="inline-flex items-center gap-3 border-l-2 border-[var(--accent-bright)] pl-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-bright)]">
                Knowledge Base
              </p>
              <h2 className="mt-1 text-[2rem] font-extrabold tracking-[-0.05em] sm:text-[2.35rem]">
                FAQ Editor
              </h2>
            </div>
          </div>
          <p className="mt-3 max-w-[660px] text-[14px] leading-6 text-[var(--text-muted)]">
            Manage reusable answers, response tags, and support knowledge for{" "}
            <span className="text-[var(--text-primary)]">{clientName}</span> in
            one green-tuned editing workspace.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--accent-bright)]">
                  {editingFaqId ? "Update FAQ" : "Create New FAQ"}
                </p>
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent-bright)]" />
              </div>

              <div className="mt-6 space-y-5">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Keywords
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. billing, account, setup"
                    value={keywordsInput}
                    onChange={(event) => setKeywordsInput(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-[var(--border-input)] bg-background px-4 py-3 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                  <p className="mt-1.5 text-[11px] text-[var(--text-subtle)]">
                    Separate tags with commas
                  </p>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Detailed Answer
                  </label>
                  <textarea
                    placeholder="Construct the definitive response..."
                    rows={6}
                    value={answerInput}
                    onChange={(event) => setAnswerInput(event.target.value)}
                    className="mt-2 w-full resize-none rounded-xl border border-[var(--border-input)] bg-background px-4 py-3 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Image ID (Optional)
                  </label>
                  <div className="mt-2 flex rounded-xl border border-[var(--border-input)] bg-background">
                    <span className="border-r border-[var(--border-input)] px-4 py-3 text-[13px] font-semibold text-[var(--text-muted)]">
                      IMG
                    </span>
                    <input
                      type="text"
                      placeholder="004291"
                      value={imageIdInput}
                      onChange={(event) => setImageIdInput(event.target.value)}
                      className="w-full px-4 py-3 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-[var(--accent-bright)] bg-[var(--accent)] px-5 py-2.5 text-[13px] font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting
                    ? editingFaqId
                      ? "Updating..."
                      : "Creating..."
                    : editingFaqId
                      ? "Update FAQ"
                      : "Commit to Library"}
                </button>

                {editingFaqId ? (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="w-full rounded-xl border border-[var(--border)] bg-background px-5 py-2.5 text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-strong)]"
                  >
                    Cancel Editing
                  </button>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Library Health
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-8 rounded-full bg-[var(--accent-bright)]" />
                  <span className="h-1.5 w-6 rounded-full bg-[#35b777]" />
                  <span className="h-1.5 w-5 rounded-full bg-[var(--border-input)]" />
                </div>
              </div>
            </section>
          </aside>

          <section>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--text-label)]">
                  Active FAQ Library
                </p>
                <p className="mt-1 text-[13px] text-[var(--text-muted)]">
                  {clientId
                    ? `${faqEntries.length} entries ready for automation.`
                    : "Select a client from the dashboard to manage FAQs."}
                </p>
              </div>
            </div>

            {notice ? (
              <div
                className={`mb-4 rounded-2xl border px-4 py-3 text-[13px] ${
                  notice.tone === "success"
                    ? "border-[var(--accent-bright)]/50 bg-[rgba(8,62,35,0.52)] text-[var(--text-primary)]"
                    : "border-[#5b2a2a] bg-[rgba(58,19,19,0.82)] text-[#ffc1c1]"
                } animate-[fadeIn_220ms_ease-out]`}
              >
                {notice.message}
              </div>
            ) : null}

            <div className="space-y-4">
              {isLoadingFaqs ? (
                <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
                  <p className="text-[14px] text-[var(--text-muted)]">
                    Loading FAQ entries...
                  </p>
                </article>
              ) : null}

              {!isLoadingFaqs && !clientId ? (
                <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
                  <p className="text-[14px] text-[var(--text-muted)]">
                    Open this page from a client card to load that client&apos;s
                    FAQ library.
                  </p>
                </article>
              ) : null}

              {!isLoadingFaqs && clientId && faqEntries.length === 0 ? (
                <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
                  <p className="text-[14px] text-[var(--text-muted)]">
                    No FAQ entries yet. Create the first one from the form on
                    the left.
                  </p>
                </article>
              ) : null}

              {faqEntries.map((entry, index) => {
                const isRemoving = removingFaqId === entry.id;
                const isAnimated = animatedFaqId === entry.id;
                const animationClass = isRemoving
                  ? "animate-[faqCardOut_280ms_ease-in_forwards]"
                  : isAnimated && animatedFaqTone === "created"
                    ? "animate-[faqCardIn_380ms_cubic-bezier(0.22,1,0.36,1),faqCardPulse_1.2s_ease-out]"
                    : isAnimated && animatedFaqTone === "updated"
                      ? "animate-[faqCardPulse_1.2s_ease-out]"
                      : "animate-[faqCardIn_320ms_cubic-bezier(0.22,1,0.36,1)]";

                return (
                  <article
                    key={entry.id}
                    className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5 transition-[border-color,box-shadow,opacity,transform] duration-300 ${animationClass} ${
                      isAnimated
                        ? "border-[var(--accent-bright)]/50 shadow-[0_0_0_1px_rgba(62,207,142,0.08),0_18px_45px_rgba(5,39,22,0.26)]"
                        : ""
                    } ${index > 0 ? "[animation-delay:40ms]" : ""}`}
                  >
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {entry.keywords.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-md border border-[var(--border)] bg-[var(--surface-strong)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-label)]"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        <h3 className="mt-4 text-[1.25rem] font-bold tracking-[-0.03em]">
                          {entry.keywords[0] || "FAQ Entry"}
                        </h3>
                        <p className="mt-3 max-w-[740px] text-[14px] leading-6 text-[var(--text-label)]">
                          {entry.answer}
                        </p>

                        <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
                          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                            {entry.image_attachment_id
                              ? `Image ID: ${entry.image_attachment_id}`
                              : "Text only response"}
                          </span>
                          <div className="flex items-center gap-3 text-[var(--text-muted)]">
                            <button
                              type="button"
                              onClick={() => handleEdit(entry)}
                              disabled={isRemoving}
                              className="rounded-lg border-none p-0 transition-colors hover:text-[var(--accent-bright)] disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label="Edit FAQ entry"
                            >
                              <svg
                                aria-hidden="true"
                                className="h-4.5 w-4.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth="1.8"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M16.86 3.49a2.12 2.12 0 1 1 3 3L8.44 17.9 4 19l1.1-4.44L16.86 3.5Z"
                                />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(entry.id)}
                              disabled={!!removingFaqId}
                              className="rounded-lg border-none p-0 transition-colors hover:text-[#f7abab] disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label="Delete FAQ entry"
                            >
                              <svg
                                aria-hidden="true"
                                className="h-4.5 w-4.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth="1.8"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M4 7h16m-10 4v6m4-6v6M6 7l1 12a1 1 0 0 0 1 .92h8a1 1 0 0 0 1-.92L18 7M9 7V4.75A.75.75 0 0 1 9.75 4h4.5a.75.75 0 0 1 .75.75V7"
                                />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex h-[92px] w-full shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[radial-gradient(circle_at_top_left,_rgba(62,207,142,0.22),_transparent_55%),linear-gradient(135deg,#1d3025_0%,#101010_100%)] sm:w-[112px]">
                        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent-bright)]">
                          {isRemoving ? "Deleting" : "FAQ"}
                        </span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </DashboardShell>
  );
};

export default FaqEditorPage;
