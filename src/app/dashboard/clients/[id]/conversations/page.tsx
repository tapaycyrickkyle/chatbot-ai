"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/app/_components/ToastProvider";
import DashboardShell from "../../../_components/DashboardShell";

type Conversation = {
  id: string;
  client_id: string;
  page_id: string;
  recipient_id: string;
  last_customer_message: string;
  last_message_at: string;
  ai_paused: boolean;
  paused_at: string;
  paused_by: string;
  resumed_at: string;
  created_at: string;
  updated_at: string;
};

type ConversationsResponse = {
  client?: {
    id: string;
    client_name: string;
    page_id: string;
  };
  conversations?: Conversation[];
  error?: string;
};

function formatTimestamp(value: string) {
  if (!value) {
    return "No activity yet";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "No activity yet";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ConversationsPage() {
  const params = useParams<{ id: string }>();
  const clientId = Array.isArray(params?.id) ? params.id[0] : params?.id ?? "";
  const { showToast } = useToast();
  const [clientName, setClientName] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingRecipientId, setUpdatingRecipientId] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    if (!clientId) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `/api/clients/${encodeURIComponent(clientId)}/conversations`,
        { cache: "no-store" }
      );
      const data = (await response.json().catch(() => null)) as
        | ConversationsResponse
        | null;

      if (!response.ok || !data) {
        throw new Error(data?.error || "Failed to load conversations");
      }

      setClientName(data.client?.client_name || "");
      setConversations(Array.isArray(data.conversations) ? data.conversations : []);
    } catch (error) {
      console.error(error);
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to load conversations.",
      });
    } finally {
      setLoading(false);
    }
  }, [clientId, showToast]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const pausedCount = useMemo(
    () => conversations.filter((conversation) => conversation.ai_paused).length,
    [conversations]
  );

  const updateAiStatus = async (recipientId: string, action: "pause" | "resume") => {
    setUpdatingRecipientId(recipientId);

    try {
      const response = await fetch(
        `/api/clients/${encodeURIComponent(clientId)}/conversations`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientId, action }),
        }
      );
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(data?.error || "Failed to update AI status");
      }

      setConversations((currentConversations) =>
        currentConversations.map((conversation) =>
          conversation.recipient_id === recipientId
            ? {
                ...conversation,
                ai_paused: action === "pause",
                paused_by: action === "pause" ? "admin" : "",
                paused_at: action === "pause" ? new Date().toISOString() : conversation.paused_at,
                resumed_at: action === "resume" ? new Date().toISOString() : conversation.resumed_at,
              }
            : conversation
        )
      );
      showToast({
        tone: "success",
        message: action === "pause" ? "AI paused for this customer." : "AI resumed for this customer.",
      });
    } catch (error) {
      console.error(error);
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to update AI status.",
      });
    } finally {
      setUpdatingRecipientId(null);
    }
  };

  return (
    <DashboardShell activeNav="Clients" searchPlaceholder="Search conversations..." showTopBar={false}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--accent-bright)]">
              Conversations
            </p>
            <h1 className="mt-2 text-[2rem] font-extrabold tracking-[-0.05em] text-[var(--text-primary)]">
              {clientName || "Client"}
            </h1>
            <p className="mt-2 text-[14px] text-[var(--text-muted)]">
              Pause or resume AI replies when the owner takes over a customer conversation.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/dashboard/clients/${encodeURIComponent(clientId)}/prompt-builder`}
              className="inline-flex w-fit items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-strong)]"
            >
              Prompt Builder
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex w-fit items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-strong)]"
            >
              Back to Clients
            </Link>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Conversations
            </p>
            <p className="mt-2 text-[1.5rem] font-extrabold text-[var(--text-primary)]">
              {conversations.length}
            </p>
          </div>
          <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              AI Paused
            </p>
            <p className="mt-2 text-[1.5rem] font-extrabold text-[#ffd37a]">
              {pausedCount}
            </p>
          </div>
          <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              AI Active
            </p>
            <p className="mt-2 text-[1.5rem] font-extrabold text-[var(--accent-bright)]">
              {Math.max(conversations.length - pausedCount, 0)}
            </p>
          </div>
        </div>

        <section className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
          {loading ? (
            <div className="rounded border border-[var(--border)] bg-background px-5 py-5 text-[14px] text-[var(--text-muted)]">
              Loading conversations...
            </div>
          ) : conversations.length === 0 ? (
            <div className="rounded border border-[var(--border)] bg-background px-5 py-5 text-[14px] leading-6 text-[var(--text-muted)]">
              No customer conversations have been recorded yet. New customer messages will appear here after the database table is set up.
            </div>
          ) : (
            <div className="space-y-3">
              {conversations.map((conversation) => (
                <article
                  key={conversation.id}
                  className="rounded border border-[var(--border)] bg-background px-5 py-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="break-all text-[1rem] font-bold text-[var(--text-primary)]">
                          {conversation.recipient_id}
                        </h2>
                        <span
                          className={`rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                            conversation.ai_paused
                              ? "border-[#7a5a25] bg-[#2b2417] text-[#ffd37a]"
                              : "border-[var(--accent-bright)] bg-[var(--accent)]/15 text-[var(--accent-bright)]"
                          }`}
                        >
                          {conversation.ai_paused ? "AI Paused" : "AI Active"}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-[14px] leading-6 text-[var(--text-muted)]">
                        {conversation.last_customer_message || "No customer message preview available."}
                      </p>
                      <p className="mt-2 text-[12px] text-[var(--text-subtle)]">
                        Last activity: {formatTimestamp(conversation.last_message_at)}
                      </p>
                      {conversation.ai_paused ? (
                        <p className="mt-1 text-[12px] text-[var(--text-subtle)]">
                          Paused by {conversation.paused_by || "owner"} at {formatTimestamp(conversation.paused_at)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {conversation.ai_paused ? (
                        <button
                          type="button"
                          onClick={() => void updateAiStatus(conversation.recipient_id, "resume")}
                          disabled={updatingRecipientId === conversation.recipient_id}
                          className="inline-flex items-center justify-center rounded-md border border-[var(--accent-bright)] bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {updatingRecipientId === conversation.recipient_id ? "Updating..." : "Resume AI"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void updateAiStatus(conversation.recipient_id, "pause")}
                          disabled={updatingRecipientId === conversation.recipient_id}
                          className="inline-flex items-center justify-center rounded-md border border-[#7a5a25] bg-[#2b2417] px-4 py-2 text-[13px] font-semibold text-[#ffd37a] transition-colors hover:bg-[#382d19] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {updatingRecipientId === conversation.recipient_id ? "Updating..." : "Pause AI"}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
