"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/app/_components/ToastProvider";
import LoadingModal from "@/app/_components/LoadingModal";
import OwnerShell from "../_components/OwnerShell";

type Conversation = {
  id: string;
  recipient_id: string;
  last_customer_message: string;
  last_message_at: string;
  ai_paused: boolean;
  paused_at: string;
  paused_by: string;
};

type ConversationsResponse = {
  client?: {
    client_name: string;
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

export default function OwnerConversationsPage() {
  const { showToast } = useToast();
  const [clientName, setClientName] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingRecipientId, setUpdatingRecipientId] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const response = await fetch("/api/owner/conversations", { cache: "no-store" });
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
  }, [showToast]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const updateAiStatus = async (recipientId: string, action: "pause" | "resume") => {
    setUpdatingRecipientId(recipientId);

    try {
      const response = await fetch("/api/owner/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId, action }),
      });
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
                paused_by: action === "pause" ? "owner" : "",
                paused_at: action === "pause" ? new Date().toISOString() : conversation.paused_at,
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
    <OwnerShell
      title="Conversations"
      description={clientName ? `${clientName} customer handoff controls.` : "Customer handoff controls."}
    >
      <section className="overflow-hidden rounded border border-[var(--border)] bg-[var(--surface)]">
        {loading ? (
          <div className="px-5 py-5 text-[14px] text-[var(--text-muted)]">
            Loading conversations...
          </div>
        ) : conversations.length === 0 ? (
          <div className="px-5 py-5 text-[14px] leading-6 text-[var(--text-muted)]">
            No customer conversations have been recorded yet.
          </div>
        ) : (
          <div>
            {conversations.map((conversation) => (
              <article
                key={conversation.id}
                className="border-t border-[var(--border)] bg-background px-4 py-4 first:border-t-0 sm:px-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="break-all text-[1rem] font-bold text-[var(--text-primary)]">
                        Customer {conversation.recipient_id.slice(-6)}
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
                    <p className="mt-2 line-clamp-2 break-words text-[14px] leading-6 text-[var(--text-muted)]">
                      {conversation.last_customer_message || "No customer message preview available."}
                    </p>
                    <p className="mt-2 text-[12px] text-[var(--text-subtle)]">
                      Last activity: {formatTimestamp(conversation.last_message_at)}
                    </p>
                    {conversation.ai_paused ? (
                      <p className="mt-1 break-words text-[12px] text-[var(--text-subtle)]">
                        Paused by {conversation.paused_by || "owner"} at {formatTimestamp(conversation.paused_at)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex w-full flex-wrap gap-2 lg:w-auto">
                    {conversation.ai_paused ? (
                      <button
                        type="button"
                        onClick={() => void updateAiStatus(conversation.recipient_id, "resume")}
                        disabled={updatingRecipientId === conversation.recipient_id}
                        className="inline-flex w-full items-center justify-center rounded-md border border-[var(--accent-bright)] bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                      >
                        {updatingRecipientId === conversation.recipient_id ? "Updating..." : "Resume AI"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void updateAiStatus(conversation.recipient_id, "pause")}
                        disabled={updatingRecipientId === conversation.recipient_id}
                        className="inline-flex w-full items-center justify-center rounded-md border border-[#7a5a25] bg-[#2b2417] px-4 py-2 text-[13px] font-semibold text-[#ffd37a] transition-colors hover:bg-[#382d19] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
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
      <LoadingModal isOpen={Boolean(updatingRecipientId)} message="Updating AI status..." />
    </OwnerShell>
  );
}
