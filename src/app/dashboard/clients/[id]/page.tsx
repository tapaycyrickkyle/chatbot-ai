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
  bot_type: "ai";
  business_info: string;
};

export default function ClientSettingsPage() {
  const params = useParams<{ id: string }>();
  const clientId = Array.isArray(params?.id) ? params.id[0] : params?.id ?? "";
  const { showToast } = useToast();
  const [clientName, setClientName] = useState("");
  const [pageId, setPageId] = useState("");
  const [loading, setLoading] = useState(true);
  const [cleaningStorage, setCleaningStorage] = useState(false);

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
          throw new Error(data?.error || "Failed to load page settings");
        }

        setClientName(data.client_name || "");
        setPageId(data.page_id || "");
      } catch (error) {
        console.error(error);
        showToast({
          tone: "error",
          message: error instanceof Error ? error.message : "Failed to load page settings.",
        });
      } finally {
        setLoading(false);
      }
    };

    void loadClient();
  }, [clientId, showToast]);

  const cleanupStorage = async () => {
    setCleaningStorage(true);

    try {
      const response = await fetch("/api/admin/storage-cleanup", {
        method: "POST",
      });

      const data = (await response.json().catch(() => null)) as
        | {
            error?: string;
            deletedRateLimitLogs?: number;
            deletedReplySessions?: number;
            logRetentionDays?: number;
            sessionRetentionHours?: number;
            warnings?: string[];
          }
        | null;

      if (!response.ok) {
        throw new Error(data?.error || "Failed to clean old storage data");
      }

      const warnings = data?.warnings ?? [];

      showToast({
        tone: warnings.length > 0 ? "error" : "success",
        message:
          warnings.length > 0
            ? `Cleanup finished with ${warnings.length} skipped table${warnings.length === 1 ? "" : "s"}. Deleted ${data?.deletedRateLimitLogs ?? 0} old log rows and ${data?.deletedReplySessions ?? 0} old reply sessions.`
            : `Cleanup finished. Deleted ${data?.deletedRateLimitLogs ?? 0} old log rows and ${data?.deletedReplySessions ?? 0} old reply sessions.`,
      });
    } catch (error) {
      console.error(error);
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to clean old storage data.",
      });
    } finally {
      setCleaningStorage(false);
    }
  };

  return (
    <DashboardShell activeNav="Pages" searchPlaceholder="Search pages..." showTopBar={false}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--accent-bright)]">
              Page Settings
            </p>
            <h1 className="mt-2 text-[1.8rem] font-extrabold text-[var(--text-primary)]">
              {clientName || "Connected page"}
            </h1>
            <p className="mt-2 text-[14px] text-[var(--text-muted)]">
              Manage this page&apos;s AI instructions, handoff controls, and maintenance tools.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex w-fit items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-strong)]"
          >
            Back to Pages
          </Link>
        </div>

        {loading ? (
          <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-5 py-5 text-[14px] text-[var(--text-muted)]">
            Loading page settings...
          </div>
        ) : (
          <div className="rounded border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded border border-[var(--border)] bg-background/80 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Page Name
                </p>
                <p className="mt-2 text-[15px] font-semibold text-[var(--text-primary)]">
                  {clientName || "Unknown page"}
                </p>
              </div>
              <div className="rounded border border-[var(--border)] bg-background/80 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Page ID
                </p>
                <p className="mt-2 break-all text-[15px] font-semibold text-[var(--text-primary)]">
                  {pageId || "Not available"}
                </p>
              </div>
            </div>

            <div className="mt-8 rounded border border-[var(--border)] bg-background/80 px-4 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                AI Conversation Control
              </p>
              <p className="mt-2 text-[14px] text-[var(--text-primary)]">
                Pause or resume AI replies when a human owner takes over a conversation.
              </p>
              <div className="mt-4">
                <Link
                  href={`/dashboard/clients/${encodeURIComponent(clientId)}/conversations`}
                  className="inline-flex items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-strong)]"
                >
                  Open Conversations
                </Link>
              </div>
            </div>

            <div className="mt-8 rounded border border-[var(--border)] bg-background/80 px-4 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Storage Cleanup
              </p>
              <p className="mt-2 text-[14px] text-[var(--text-primary)]">
                Delete old temporary data from logs and legacy reply sessions.
              </p>
              <p className="mt-2 text-[12px] leading-6 text-[var(--text-muted)]">
                This removes `rate_limit_logs` older than 7 days and any legacy reply sessions older than 24 hours.
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => void cleanupStorage()}
                  disabled={cleaningStorage || loading}
                  className="inline-flex items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-strong)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {cleaningStorage ? "Cleaning..." : "Clean Old Logs & Sessions"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
