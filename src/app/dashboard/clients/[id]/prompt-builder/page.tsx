"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/app/_components/ToastProvider";
import DashboardShell from "../../../_components/DashboardShell";

type ClientSettings = {
  id: string;
  client_name: string;
  page_id: string;
  bot_type: "keyword" | "ai";
  business_info: string;
};

export default function PromptBuilderPage() {
  const params = useParams<{ id: string }>();
  const clientId = Array.isArray(params?.id) ? params.id[0] : params?.id ?? "";
  const { showToast } = useToast();
  const [clientName, setClientName] = useState("");
  const [botType, setBotType] = useState<"keyword" | "ai">("keyword");
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
        setBotType(data.bot_type === "ai" ? "ai" : "keyword");
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

  return (
    <DashboardShell activeNav="Clients" searchPlaceholder="Search clients..." showTopBar={false}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--accent-bright)]">
              Prompt Builder
            </p>
            <h1 className="mt-2 text-[2rem] font-extrabold tracking-[-0.05em] text-[var(--text-primary)]">
              {clientName || "Client"}
            </h1>
            <p className="mt-2 text-[14px] text-[var(--text-muted)]">
              Write the AI prompt and business knowledge for this page.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/dashboard/clients/${encodeURIComponent(clientId)}`}
              className="inline-flex w-fit items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-strong)]"
            >
              Settings
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex w-fit items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-strong)]"
            >
              Back to Clients
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5 text-[14px] text-[var(--text-muted)]">
            Loading AI builder...
          </div>
        ) : botType !== "ai" ? (
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
            <p className="text-[15px] text-[var(--text-primary)]">
              This client is currently in free chatbot mode.
            </p>
            <p className="mt-2 text-[14px] text-[var(--text-muted)]">
              Switch the bot mode to Full AI in Settings to use the prompt builder.
            </p>
          </div>
        ) : (
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
            <label className="block text-[13px] font-semibold text-[var(--text-primary)]" htmlFor="ai-prompt">
              AI Prompt
            </label>
            <textarea
              id="ai-prompt"
              rows={18}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={"Example:\nYou are the official assistant for our business.\nAnswer only using the details below.\nStore hours: 9am-6pm Mon-Sat\nDelivery areas: Manila only\nRefunds: No refunds on sale items"}
              className="mt-2 w-full rounded-2xl border border-[var(--border-input)] bg-background px-4 py-3 font-mono text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
            />
            <p className="mt-2 text-[12px] leading-6 text-[var(--text-muted)]">
              This prompt is what Full AI mode uses to answer customers. It replaces the keyword flow builder for this client.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void savePrompt()}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-xl border border-[var(--accent-bright)] bg-[var(--accent)] px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? "Saving..." : "Save Prompt"}
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
