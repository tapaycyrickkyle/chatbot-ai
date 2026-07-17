"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/app/_components/ToastProvider";
import LoadingModal from "@/app/_components/LoadingModal";
import {
  COMPACT_BUSINESS_INFO_TEMPLATE,
  MAX_BUSINESS_INFO_LENGTH,
} from "@/lib/business-info";
import DashboardShell from "../../../_components/DashboardShell";

type ClientSettings = {
  id: string;
  client_name: string;
  page_id: string;
  bot_type: "ai";
  business_info: string;
};

export default function PromptBuilderPage() {
  const params = useParams<{ id: string }>();
  const clientId = Array.isArray(params?.id) ? params.id[0] : params?.id ?? "";
  const { showToast } = useToast();
  const [clientName, setClientName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!clientId) {
      setLoading(false);
      return;
    }

    const loadClient = async () => {
      try {
        const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}`, {
          cache: "no-store",
        });
        const data = (await response.json().catch(() => null)) as
          | (ClientSettings & { error?: string })
          | { error?: string }
          | null;

        if (!response.ok || !data || !("id" in data)) {
          throw new Error(data?.error || "Failed to load AI builder");
        }

        setClientName(data.client_name || "");
        setPrompt(data.business_info || "");
      } catch (error) {
        console.error(error);
        showToast({
          tone: "error",
          message: error instanceof Error ? error.message : "Failed to load AI builder.",
        });
      } finally {
        setLoading(false);
      }
    };

    void loadClient();
  }, [clientId, showToast]);

  const savePrompt = async () => {
    if (!clientId) {
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_info: prompt }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error || "Failed to save AI prompt");
      }

      showToast({ tone: "success", message: "AI prompt saved." });
    } catch (error) {
      console.error(error);
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to save AI prompt.",
      });
    } finally {
      setSaving(false);
    }
  };

  const remainingCharacters = MAX_BUSINESS_INFO_LENGTH - prompt.length;

  return (
    <DashboardShell activeNav="Pages" searchPlaceholder="Search pages..." showTopBar={false}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--accent-bright)]">
              AI Instructions
            </p>
            <h1 className="mt-2 break-words text-[1.45rem] font-extrabold text-[var(--text-primary)] sm:text-[1.8rem]">
              {clientName || "Connected page"}
            </h1>
            <p className="mt-2 text-[14px] text-[var(--text-muted)]">
              Keep the business facts short, current, and easy for the AI to follow.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 min-[360px]:flex min-[360px]:flex-wrap">
            <Link
              href={`/dashboard/clients/${encodeURIComponent(clientId)}`}
              className="inline-flex w-full items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-strong)] min-[360px]:w-fit"
            >
              Settings
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex w-full items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-strong)] min-[360px]:w-fit"
            >
              Back to Pages
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-5 py-5 text-[14px] text-[var(--text-muted)]">
            Loading AI builder...
          </div>
        ) : (
          <div className="rounded border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
            <label className="block text-[13px] font-semibold text-[var(--text-primary)]" htmlFor="ai-prompt">
              Business Knowledge
            </label>
            <textarea
              id="ai-prompt"
              rows={18}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              maxLength={MAX_BUSINESS_INFO_LENGTH}
              placeholder={COMPACT_BUSINESS_INFO_TEMPLATE}
              className="mt-2 w-full rounded border border-[var(--border-input)] bg-background px-3 py-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 sm:px-4"
            />
            <div className="mt-2 flex flex-col gap-2 text-[12px] leading-6 text-[var(--text-muted)]">
              <p>
                {prompt.length} / {MAX_BUSINESS_INFO_LENGTH} characters used
                {remainingCharacters >= 0 ? `, ${remainingCharacters} left.` : "."}
              </p>
              <p>
                Use short labeled lines for products, pricing, payment, delivery, and policies.
              </p>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => void savePrompt()}
                disabled={saving}
                className="inline-flex w-full items-center justify-center rounded-md border border-[var(--accent-bright)] bg-[var(--accent)] px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
              >
                {saving ? "Saving..." : "Save Prompt"}
              </button>
            </div>
          </div>
        )}
      </div>
      <LoadingModal isOpen={saving} message="Saving prompt..." />
    </DashboardShell>
  );
}
