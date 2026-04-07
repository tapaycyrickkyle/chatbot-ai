"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/app/_components/ToastProvider";
import DashboardShell from "../../_components/DashboardShell";

type ClientSettings = {
  id: string;
  client_name: string;
  page_id: string;
  bot_type: "keyword" | "ai";
  business_info: string;
};

export default function ClientSettingsPage() {
  const params = useParams<{ id: string }>();
  const clientId = Array.isArray(params?.id) ? params.id[0] : params?.id ?? "";
  const { showToast } = useToast();
  const [clientName, setClientName] = useState("");
  const [pageId, setPageId] = useState("");
  const [botType, setBotType] = useState<"keyword" | "ai">("keyword");
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
          throw new Error(data?.error || "Failed to load client settings");
        }

        setClientName(data.client_name || "");
        setPageId(data.page_id || "");
        setBotType(data.bot_type === "ai" ? "ai" : "keyword");
      } catch (error) {
        console.error(error);
        showToast({
          tone: "error",
          message: error instanceof Error ? error.message : "Failed to load client settings.",
        });
      } finally {
        setLoading(false);
      }
    };

    void loadClient();
  }, [clientId, showToast]);

  const saveSettings = async () => {
    if (!clientId) {
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_type: botType }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error || "Failed to save settings");
      }

      showToast({ tone: "success", message: "Bot mode updated." });
    } catch (error) {
      console.error(error);
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to save settings.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardShell activeNav="Clients" searchPlaceholder="Search clients..." showTopBar={false}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--accent-bright)]">
              Client Settings
            </p>
            <h1 className="mt-2 text-[2rem] font-extrabold tracking-[-0.05em] text-[var(--text-primary)]">
              {clientName || "Client"}
            </h1>
            <p className="mt-2 text-[14px] text-[var(--text-muted)]">
              Choose which chatbot builder this page should use.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex w-fit items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-strong)]"
          >
            Back to Clients
          </Link>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5 text-[14px] text-[var(--text-muted)]">
            Loading client settings...
          </div>
        ) : (
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-[var(--border)] bg-background/80 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Client Name
                </p>
                <p className="mt-2 text-[15px] font-semibold text-[var(--text-primary)]">
                  {clientName || "Unknown client"}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-background/80 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Page ID
                </p>
                <p className="mt-2 break-all text-[15px] font-semibold text-[var(--text-primary)]">
                  {pageId || "Not available"}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <label className="block text-[13px] font-semibold text-[var(--text-primary)]" htmlFor="bot-type">
                Bot Mode
              </label>
              <select
                id="bot-type"
                value={botType}
                onChange={(event) => setBotType(event.target.value === "ai" ? "ai" : "keyword")}
                className="mt-2 w-full rounded-xl border border-[var(--border-input)] bg-background px-4 py-2.5 text-[14px] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
              >
                <option value="keyword">Chatbot Free - Flow Builder</option>
                <option value="ai">Full AI - Prompt Builder</option>
              </select>
              <p className="mt-2 text-[12px] leading-6 text-[var(--text-muted)]">
                Free mode uses the existing keyword flow builder. Full AI mode uses a dedicated prompt builder.
              </p>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void saveSettings()}
                disabled={saving || loading}
                className="inline-flex items-center justify-center rounded-xl border border-[var(--accent-bright)] bg-[var(--accent)] px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? "Saving..." : "Save Settings"}
              </button>
              <Link
                href={`/dashboard/clients/${encodeURIComponent(clientId)}/builder`}
                className="inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-5 py-2.5 text-[14px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface)]"
              >
                Open Builder
              </Link>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
