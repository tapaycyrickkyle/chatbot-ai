"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useToast } from "@/app/_components/ToastProvider";
import LoadingModal from "@/app/_components/LoadingModal";

type ClientSettings = {
  id: string;
  client_name: string;
  page_id: string;
  bot_type: "ai";
  business_info: string;
  welcome_sequence_enabled: boolean;
  welcome_message: string;
  welcome_link_url: string;
  welcome_image_urls: string;
  manual_ai_pause_minutes: number;
  auto_reply_ignore_pattern: string;
  lead_capture_enabled: boolean;
  lead_capture_fields: string;
  google_sheets_webhook_url: string;
  google_sheets_tab_name: string;
  lead_delivery?: { delivered: number; failed: number; pending: number };
};

const DEFAULT_MANUAL_AI_PAUSE_MINUTES = 5;
const MAX_WELCOME_MESSAGES = 5;
const MAX_WELCOME_MESSAGE_LENGTH = 1200;
const MAX_AUTO_REPLY_IGNORE_PATTERNS = 10;
const MAX_AUTO_REPLY_IGNORE_PATTERN_LENGTH = 500;
const MAX_LEAD_FIELDS = 8;
const LEAD_FIELD_TYPES = ["name", "phone", "email", "text", "number", "date", "address"] as const;
type LeadFieldType = (typeof LEAD_FIELD_TYPES)[number];
type LeadField = { label: string; type: LeadFieldType };

function parseLeadFields(value: string): LeadField[] {
  return value.split(/\r?\n/).flatMap((line) => {
    const [label, type] = line.split("|");
    return label?.trim() && LEAD_FIELD_TYPES.includes(type?.trim() as LeadFieldType)
      ? [{ label: label.trim(), type: type.trim() as LeadFieldType }]
      : [];
  }).slice(0, MAX_LEAD_FIELDS);
}

function serializeLeadFields(fields: LeadField[]) {
  return fields.map((field) => `${field.label.trim()}|${field.type}`).join("\n");
}
const MANUAL_AI_PAUSE_OPTIONS = [
  { label: "5 minutes", value: 5 },
  { label: "15 minutes", value: 15 },
  { label: "30 minutes", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "2 hours", value: 120 },
  { label: "4 hours", value: 240 },
  { label: "8 hours", value: 480 },
  { label: "24 hours", value: 1440 },
];

function normalizeManualAiPauseMinutes(value: number | null | undefined) {
  return typeof value === "number" &&
    MANUAL_AI_PAUSE_OPTIONS.some((option) => option.value === value)
    ? value
    : DEFAULT_MANUAL_AI_PAUSE_MINUTES;
}

function createEmptyWelcomeMessages() {
  return Array.from({ length: MAX_WELCOME_MESSAGES }, () => "");
}

function parseWelcomeMessages(value: string) {
  const messages = value
    .split(/\n\s*\n/)
    .map((message) => message.trim())
    .filter(Boolean)
    .slice(0, MAX_WELCOME_MESSAGES);
  const paddedMessages = createEmptyWelcomeMessages();

  messages.forEach((message, index) => {
    paddedMessages[index] = message;
  });

  return paddedMessages;
}

function serializeWelcomeMessages(messages: string[]) {
  return messages
    .map((message) => message.trim())
    .filter(Boolean)
    .slice(0, MAX_WELCOME_MESSAGES)
    .join("\n\n");
}

function parseAutoReplyIgnorePatterns(value: string) {
  const patterns = value
    .split(/\r?\n/)
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .slice(0, MAX_AUTO_REPLY_IGNORE_PATTERNS);

  return patterns.length > 0 ? patterns : [""];
}

function serializeAutoReplyIgnorePatterns(patterns: string[]) {
  return patterns
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .slice(0, MAX_AUTO_REPLY_IGNORE_PATTERNS)
    .join("\n");
}

const panelClass =
  "min-w-0 rounded border border-[var(--border)] bg-[var(--surface)] px-4 py-5 shadow-[0_1px_0_rgba(255,255,255,0.03)] sm:px-6 sm:py-6";
const labelClass = "block text-[13px] font-semibold text-[var(--text-label)]";
const inputClass =
  "min-h-11 w-full min-w-0 rounded-md border border-[var(--border-input)] bg-background px-3 py-2.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20";
const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--border)] bg-background px-4 py-2.5 text-center text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-strong)] disabled:cursor-not-allowed disabled:opacity-70";
const primaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--accent-bright)] bg-[var(--accent)] px-4 py-2.5 text-center text-[13px] font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-70";

function SettingsSection({
  eyebrow,
  title,
  description,
  children,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className={panelClass}>
      <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent-bright)]">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-[1.08rem] font-bold text-[var(--text-primary)] sm:text-[1.15rem]">
            {title}
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-6 text-[var(--text-muted)]">
            {description}
          </p>
        </div>
        {actions ? <div className="w-full shrink-0 lg:w-auto">{actions}</div> : null}
      </div>
      <div className="pt-5 sm:pt-6">{children}</div>
    </section>
  );
}

function getWelcomeMessageOrder(index: number) {
  return [
    "Sent first",
    "Sent second",
    "Sent third",
    "Sent fourth",
    "Sent fifth",
  ][index] ?? `Sent #${index + 1}`;
}

export default function ClientSettingsPage() {
  const params = useParams<{ id: string }>();
  const clientId = Array.isArray(params?.id) ? params.id[0] : params?.id ?? "";
  const { showToast } = useToast();
  const [clientName, setClientName] = useState("");
  const [pageId, setPageId] = useState("");
  const [welcomeSequenceEnabled, setWelcomeSequenceEnabled] = useState(false);
  const [welcomeMessages, setWelcomeMessages] = useState(createEmptyWelcomeMessages);
  const [welcomeLinkUrl, setWelcomeLinkUrl] = useState("");
  const [welcomeImageUrls, setWelcomeImageUrls] = useState("");
  const [manualAiPauseMinutes, setManualAiPauseMinutes] = useState(DEFAULT_MANUAL_AI_PAUSE_MINUTES);
  const [autoReplyIgnorePatterns, setAutoReplyIgnorePatterns] = useState<string[]>([""]);
  const [leadCaptureEnabled, setLeadCaptureEnabled] = useState(false);
  const [leadFields, setLeadFields] = useState<LeadField[]>([
    { label: "Full Name", type: "name" }, { label: "Phone", type: "phone" },
  ]);
  const [googleSheetsWebhookUrl, setGoogleSheetsWebhookUrl] = useState("");
  const [googleSheetsTabName, setGoogleSheetsTabName] = useState("Sheet1");
  const [savingLeadCapture, setSavingLeadCapture] = useState(false);
  const [leadDelivery, setLeadDelivery] = useState({ delivered: 0, failed: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [cleaningStorage, setCleaningStorage] = useState(false);
  const [repairingMessengerWebhook, setRepairingMessengerWebhook] = useState(false);
  const [savingWelcomeSequence, setSavingWelcomeSequence] = useState(false);
  const [savingAutoReplyIgnorePattern, setSavingAutoReplyIgnorePattern] = useState(false);
  const [uploadingWelcomeImage, setUploadingWelcomeImage] = useState(false);
  const welcomeAttachmentIds = welcomeImageUrls
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);

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
        setWelcomeSequenceEnabled(Boolean(data.welcome_sequence_enabled));
        setWelcomeMessages(parseWelcomeMessages(data.welcome_message || ""));
        setWelcomeLinkUrl(data.welcome_link_url || "");
        setWelcomeImageUrls(data.welcome_image_urls || "");
        setManualAiPauseMinutes(normalizeManualAiPauseMinutes(data.manual_ai_pause_minutes));
        setAutoReplyIgnorePatterns(parseAutoReplyIgnorePatterns(data.auto_reply_ignore_pattern || ""));
        setLeadCaptureEnabled(Boolean(data.lead_capture_enabled));
        const parsedFields = parseLeadFields(data.lead_capture_fields || "");
        if (parsedFields.length > 0) setLeadFields(parsedFields);
        setGoogleSheetsWebhookUrl(data.google_sheets_webhook_url || "");
        setGoogleSheetsTabName(data.google_sheets_tab_name || "Sheet1");
        setLeadDelivery(data.lead_delivery || { delivered: 0, failed: 0, pending: 0 });
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
            deletedAiMessageJobs?: number;
            deletedAiConversations?: number;
            logRetentionDays?: number;
            aiMessageJobRetentionDays?: number;
            aiConversationRetentionDays?: number;
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
            ? `Cleanup finished with ${warnings.length} skipped table${warnings.length === 1 ? "" : "s"}. Deleted ${data?.deletedRateLimitLogs ?? 0} logs, ${data?.deletedAiMessageJobs ?? 0} jobs, and ${data?.deletedAiConversations ?? 0} conversations.`
            : `Cleanup finished. Deleted ${data?.deletedRateLimitLogs ?? 0} logs, ${data?.deletedAiMessageJobs ?? 0} jobs, and ${data?.deletedAiConversations ?? 0} conversations.`,
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

  const saveWelcomeSequence = async () => {
    if (!clientId) {
      return;
    }

    setSavingWelcomeSequence(true);

    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          welcome_sequence_enabled: welcomeSequenceEnabled,
          welcome_message: serializeWelcomeMessages(welcomeMessages),
          welcome_link_url: welcomeLinkUrl,
          welcome_image_urls: welcomeImageUrls,
        }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error || "Failed to save first reply sequence");
      }

      showToast({ tone: "success", message: "First reply sequence saved." });
    } catch (error) {
      console.error(error);
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to save first reply sequence.",
      });
    } finally {
      setSavingWelcomeSequence(false);
    }
  };

  const repairMessengerWebhook = async () => {
    if (!clientId) {
      return;
    }

    setRepairingMessengerWebhook(true);

    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "repair_messenger_webhook" }),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(data?.error || "Failed to repair Messenger webhook");
      }

      showToast({ tone: "success", message: "Messenger webhook subscription repaired." });
    } catch (error) {
      console.error(error);
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to repair Messenger webhook.",
      });
    } finally {
      setRepairingMessengerWebhook(false);
    }
  };

  const saveAutoReplyIgnorePattern = async () => {
    if (!clientId) {
      return;
    }

    setSavingAutoReplyIgnorePattern(true);

    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manual_ai_pause_minutes: manualAiPauseMinutes,
          auto_reply_ignore_pattern: serializeAutoReplyIgnorePatterns(autoReplyIgnorePatterns),
        }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error || "Failed to save AI conversation controls");
      }

      showToast({ tone: "success", message: "AI conversation controls saved." });
    } catch (error) {
      console.error(error);
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to save AI conversation controls.",
      });
    } finally {
      setSavingAutoReplyIgnorePattern(false);
    }
  };

  const uploadWelcomeImage = async (file: File | undefined) => {
    if (!clientId || !file) {
      return;
    }

    setUploadingWelcomeImage(true);

    try {
      const formData = new FormData();
      formData.append("clientId", clientId);
      formData.append("file", file);

      const response = await fetch("/api/facebook/attachments", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as
        | { attachmentId?: string; error?: string }
        | null;

      if (!response.ok || !data?.attachmentId) {
        throw new Error(data?.error || "Failed to upload image to Messenger");
      }

      const nextAttachmentIds = [
        ...welcomeImageUrls.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
        data.attachmentId,
      ].slice(0, 11);

      setWelcomeImageUrls(nextAttachmentIds.join("\n"));
      showToast({ tone: "success", message: "Image uploaded to Messenger." });
    } catch (error) {
      console.error(error);
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to upload image.",
      });
    } finally {
      setUploadingWelcomeImage(false);
    }
  };

  const updateWelcomeMessage = (index: number, value: string) => {
    setWelcomeMessages((currentMessages) =>
      currentMessages.map((message, messageIndex) =>
        messageIndex === index ? value : message
      )
    );
  };

  const saveLeadCapture = async () => {
    if (!clientId) return;
    setSavingLeadCapture(true);
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_capture_enabled: leadCaptureEnabled,
          lead_capture_fields: serializeLeadFields(leadFields),
          google_sheets_webhook_url: googleSheetsWebhookUrl,
          google_sheets_tab_name: googleSheetsTabName,
        }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "Failed to save lead capture");
      showToast({ tone: "success", message: "Lead capture settings saved." });
    } catch (error) {
      console.error(error);
      showToast({ tone: "error", message: error instanceof Error ? error.message : "Failed to save lead capture." });
    } finally { setSavingLeadCapture(false); }
  };

  const updateLeadField = (index: number, key: keyof LeadField, value: string) => {
    setLeadFields((current) => current.map((field, fieldIndex) => fieldIndex === index ? { ...field, [key]: value } : field));
  };

  const updateAutoReplyIgnorePattern = (index: number, value: string) => {
    setAutoReplyIgnorePatterns((currentPatterns) =>
      currentPatterns.map((pattern, patternIndex) =>
        patternIndex === index ? value : pattern
      )
    );
  };

  const addAutoReplyIgnorePattern = () => {
    setAutoReplyIgnorePatterns((currentPatterns) =>
      currentPatterns.length >= MAX_AUTO_REPLY_IGNORE_PATTERNS
        ? currentPatterns
        : [...currentPatterns, ""]
    );
  };

  const removeAutoReplyIgnorePattern = (index: number) => {
    setAutoReplyIgnorePatterns((currentPatterns) => {
      const nextPatterns = currentPatterns.filter((_, patternIndex) => patternIndex !== index);

      return nextPatterns.length > 0 ? nextPatterns : [""];
    });
  };

  return (
    <>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 sm:gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--accent-bright)]">
              Page Settings
            </p>
            <h1 className="mt-2 break-words text-[1.55rem] font-extrabold text-[var(--text-primary)] sm:text-[2rem]">
              {clientName || "Connected page"}
            </h1>
            <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[var(--text-muted)]">
              Configure AI handoff, first replies, and page maintenance from one workspace.
            </p>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 min-[420px]:flex min-[420px]:w-auto min-[420px]:flex-wrap min-[420px]:justify-end">
            <Link
              href={`/dashboard/clients/${encodeURIComponent(clientId)}/prompt-builder`}
              className={`${secondaryButtonClass} w-full min-[420px]:w-auto`}
            >
              AI Instructions
            </Link>
            <Link href="/dashboard" className={`${secondaryButtonClass} w-full min-[420px]:w-auto`}>
              Back to Pages
            </Link>
          </div>
        </div>

        {loading ? (
          <div className={panelClass}>
            <p className="text-[14px] text-[var(--text-muted)]">Loading page settings...</p>
          </div>
        ) : (
          <>
            <div className="grid min-w-0 gap-3 md:grid-cols-3">
              {[
                ["Page", clientName || "Unknown page"],
                ["Page ID", pageId || "Not available"],
                ["AI Pause", `${manualAiPauseMinutes} min default`],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 rounded border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-subtle)]">
                    {label}
                  </p>
                  <p className="mt-2 break-words text-[14px] font-semibold text-[var(--text-primary)]" title={value}>
                    {value}
                  </p>
                </div>
              ))}
            </div>

            <SettingsSection
              eyebrow="First reply"
              title="Welcome Sequence"
              description="Messages are sent in this order after a customer first replies in Messenger."
              actions={
                <div className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-background px-3 py-2 lg:w-auto">
                  <span className="text-[12px] font-semibold text-[var(--text-muted)]">
                    {welcomeSequenceEnabled ? "Enabled" : "Disabled"}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={welcomeSequenceEnabled}
                    aria-label={welcomeSequenceEnabled ? "Disable welcome sequence" : "Enable welcome sequence"}
                    onClick={() => setWelcomeSequenceEnabled((value) => !value)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/25 ${
                      welcomeSequenceEnabled
                        ? "border-[var(--accent-bright)] bg-[var(--accent)]"
                        : "border-[var(--border)] bg-[var(--surface-strong)]"
                    }`}
                  >
                    <span
                      className={`absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                        welcomeSequenceEnabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              }
            >
              <div className="grid gap-4 lg:grid-cols-2">
                {welcomeMessages.map((message, index) => (
                  <div
                    key={`welcome-message-${index}`}
                    className="min-w-0 rounded-md border border-[var(--border)] bg-background px-4 py-4"
                  >
                    <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                      <label
                        className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]"
                        htmlFor={`welcome-message-${index}`}
                      >
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--accent-bright)] bg-[var(--accent)]/20 text-[12px] font-bold text-[var(--accent-bright)]">
                          {index + 1}
                        </span>
                        <span>{getWelcomeMessageOrder(index)}</span>
                      </label>
                      <span className="text-[11px] text-[var(--text-subtle)]">
                        {message.length} / {MAX_WELCOME_MESSAGE_LENGTH}
                      </span>
                    </div>
                    <textarea
                      id={`welcome-message-${index}`}
                      value={message}
                      onChange={(event) => updateWelcomeMessage(index, event.target.value)}
                      rows={index === 0 ? 5 : 4}
                      maxLength={MAX_WELCOME_MESSAGE_LENGTH}
                      placeholder={
                        index === 0
                          ? "This message is sent first."
                          : `Optional message sent ${index + 1} in the sequence.`
                      }
                      className={`${inputClass} mt-3 min-h-[132px] resize-y`}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-4 border-t border-[var(--border)] pt-5 lg:grid-cols-2">
                <div className="min-w-0">
                  <label className={labelClass} htmlFor="welcome-link-url">
                    Link URL
                  </label>
                  <input
                    id="welcome-link-url"
                    type="url"
                    value={welcomeLinkUrl}
                    onChange={(event) => setWelcomeLinkUrl(event.target.value)}
                    placeholder="https://facebook.com/your-page-or-post"
                    className={`${inputClass} mt-2`}
                  />
                </div>

                <div className="min-w-0">
                  <label className={labelClass} htmlFor="welcome-image-urls">
                    Messenger image attachments
                  </label>
                  <input
                    id="welcome-image-upload"
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      void uploadWelcomeImage(file);
                    }}
                    disabled={uploadingWelcomeImage || welcomeAttachmentIds.length >= 11}
                    className={`${inputClass} mt-2 min-h-[unset] file:mr-3 file:rounded file:border-0 file:bg-[var(--surface)] file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-70`}
                  />
                  <textarea
                    id="welcome-image-urls"
                    value={welcomeImageUrls}
                    onChange={(event) => setWelcomeImageUrls(event.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder={"123456789012345\n987654321098765"}
                    className={`${inputClass} mt-2 resize-y`}
                  />
                  <p className="mt-2 text-[12px] leading-6 text-[var(--text-muted)]">
                    {welcomeAttachmentIds.length} / 11 Messenger attachments used.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex justify-end border-t border-[var(--border)] pt-5">
                <button
                  type="button"
                  onClick={() => void saveWelcomeSequence()}
                  disabled={savingWelcomeSequence || loading}
                  className={`${primaryButtonClass} w-full sm:w-auto`}
                >
                  {savingWelcomeSequence ? "Saving..." : "Save Welcome Sequence"}
                </button>
              </div>
            </SettingsSection>

            <SettingsSection
              eyebrow="Qualified leads"
              title="Confirmed Lead Capture"
              description="After a customer wants to proceed, the AI collects these details, asks them to confirm, then sends one row to your Google Sheet."
              actions={<div className="flex items-center gap-3 rounded-md border border-[var(--border)] bg-background px-3 py-2"><span className="text-[12px] font-semibold text-[var(--text-muted)]">{leadCaptureEnabled ? "Enabled" : "Disabled"}</span><button type="button" role="switch" aria-checked={leadCaptureEnabled} onClick={() => setLeadCaptureEnabled((value) => !value)} className={`relative inline-flex h-6 w-11 rounded-full border ${leadCaptureEnabled ? "border-[var(--accent-bright)] bg-[var(--accent)]" : "border-[var(--border)] bg-[var(--surface-strong)]"}`}><span className={`absolute left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${leadCaptureEnabled ? "translate-x-5" : "translate-x-0"}`} /></button></div>}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3"><div><p className={labelClass}>Required customer details</p><p className="mt-1 text-[12px] text-[var(--text-muted)]">The AI accepts natural replies in any order. Phone and email values are validated.</p></div><button type="button" onClick={() => setLeadFields((current) => current.length >= MAX_LEAD_FIELDS ? current : [...current, { label: "", type: "text" }])} disabled={leadFields.length >= MAX_LEAD_FIELDS} className={secondaryButtonClass}>Add field</button></div>
                {leadFields.map((field, index) => <div key={`lead-field-${index}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]"><input value={field.label} onChange={(event) => updateLeadField(index, "label", event.target.value)} maxLength={60} placeholder="Field name, e.g. Full Name" className={inputClass} /><select value={field.type} onChange={(event) => updateLeadField(index, "type", event.target.value)} className={inputClass}>{LEAD_FIELD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select><button type="button" onClick={() => setLeadFields((current) => current.length > 1 ? current.filter((_, fieldIndex) => fieldIndex !== index) : current)} className={secondaryButtonClass}>Remove</button></div>)}
              </div>
              <div className="mt-5 grid gap-4 border-t border-[var(--border)] pt-5 lg:grid-cols-2"><div><label className={labelClass} htmlFor="google-sheets-webhook-url">Google Apps Script Web App URL</label><input id="google-sheets-webhook-url" type="url" value={googleSheetsWebhookUrl} onChange={(event) => setGoogleSheetsWebhookUrl(event.target.value)} placeholder="https://script.google.com/macros/s/.../exec" className={`${inputClass} mt-2`} /></div><div><label className={labelClass} htmlFor="google-sheets-tab-name">Google Sheet tab name</label><input id="google-sheets-tab-name" value={googleSheetsTabName} onChange={(event) => setGoogleSheetsTabName(event.target.value)} maxLength={100} placeholder="Sheet1" className={`${inputClass} mt-2`} /></div></div>
              <p className="mt-4 text-[12px] leading-6 text-[var(--text-muted)]">Set the fields here whenever your lead form changes. The one Apps Script template automatically creates new Google Sheet columns and maps values by field name, so you do not need to edit the script after deployment.</p>
              <p className="mt-2 text-[12px] leading-6 text-[var(--text-muted)]">Last 30 days: {leadDelivery.delivered} delivered, {leadDelivery.pending} waiting to retry, {leadDelivery.failed} failed delivery attempts.</p>
              <div className="mt-5 flex justify-end border-t border-[var(--border)] pt-5"><button type="button" onClick={() => void saveLeadCapture()} disabled={savingLeadCapture || loading} className={`${primaryButtonClass} w-full sm:w-auto`}>{savingLeadCapture ? "Saving..." : "Save Lead Capture"}</button></div>
            </SettingsSection>

            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.82fr)]">
              <SettingsSection
                eyebrow="AI handoff"
                title="Conversation Control"
                description="Set how the AI behaves after a human replies from the Page inbox."
                actions={
                  <Link
                    href={`/dashboard/clients/${encodeURIComponent(clientId)}/conversations`}
                    className={`${secondaryButtonClass} w-full lg:w-auto`}
                  >
                    Open Conversations
                  </Link>
                }
              >
                <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(180px,240px)_minmax(0,1fr)]">
                  <div>
                    <label className={labelClass} htmlFor="manual-ai-pause-minutes">
                      Manual reply pause duration
                    </label>
                    <select
                      id="manual-ai-pause-minutes"
                      value={manualAiPauseMinutes}
                      onChange={(event) => setManualAiPauseMinutes(Number(event.target.value))}
                      className={`${inputClass} mt-2 max-w-full sm:max-w-[220px]`}
                    >
                      {MANUAL_AI_PAUSE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-[12px] leading-6 text-[var(--text-muted)]">
                      Applies only to the customer where the human replied.
                    </p>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <label className={labelClass} htmlFor="auto-reply-ignore-pattern-0">
                          Auto-reply messages to ignore
                        </label>
                        <p className="mt-1 text-[12px] leading-6 text-[var(--text-muted)]">
                          Use {"{name}"} for customer-specific greetings.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={addAutoReplyIgnorePattern}
                        disabled={autoReplyIgnorePatterns.length >= MAX_AUTO_REPLY_IGNORE_PATTERNS}
                        className={`${secondaryButtonClass} w-full sm:w-auto`}
                      >
                        Add
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {autoReplyIgnorePatterns.map((pattern, index) => (
                        <div key={`auto-reply-ignore-pattern-${index}`} className="flex min-w-0 flex-col gap-2 min-[520px]:flex-row">
                          <input
                            id={`auto-reply-ignore-pattern-${index}`}
                            type="text"
                            value={pattern}
                            onChange={(event) =>
                              updateAutoReplyIgnorePattern(index, event.target.value)
                            }
                            maxLength={MAX_AUTO_REPLY_IGNORE_PATTERN_LENGTH}
                            placeholder={
                              index === 0
                                ? "Hello {name}, how can we assist you today?"
                                : "Call now to get faster service."
                            }
                            className={`${inputClass} min-w-0 flex-1`}
                          />
                          <button
                            type="button"
                            onClick={() => removeAutoReplyIgnorePattern(index)}
                            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-background px-3 py-2 text-center text-[12px] font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--text-primary)]"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex flex-col gap-2 border-t border-[var(--border)] pt-5 sm:flex-row sm:justify-between">
                  <button
                    type="button"
                    onClick={() => void repairMessengerWebhook()}
                    disabled={repairingMessengerWebhook || loading}
                    className={`${secondaryButtonClass} w-full sm:w-auto`}
                  >
                    {repairingMessengerWebhook ? "Repairing..." : "Repair Messenger Webhook"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveAutoReplyIgnorePattern()}
                    disabled={savingAutoReplyIgnorePattern || loading}
                    className={`${primaryButtonClass} w-full sm:w-auto`}
                  >
                    {savingAutoReplyIgnorePattern ? "Saving..." : "Save AI Controls"}
                  </button>
                </div>
              </SettingsSection>

              <SettingsSection
                eyebrow="Maintenance"
                title="Page Tools"
                description="Run occasional fixes and cleanups for this connected Page."
              >
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-md border border-[var(--border)] bg-background px-4 py-4">
                    <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                      Storage cleanup
                    </p>
                    <p className="mt-1 text-[12px] leading-6 text-[var(--text-muted)]">
                      Removes old rate limit logs and legacy reply sessions.
                    </p>
                    <button
                      type="button"
                      onClick={() => void cleanupStorage()}
                      disabled={cleaningStorage || loading}
                      className={`${secondaryButtonClass} mt-3 w-full`}
                    >
                      {cleaningStorage ? "Cleaning..." : "Clean Old Logs"}
                    </button>
                  </div>
                  <div className="rounded-md border border-[var(--border)] bg-background px-4 py-4">
                    <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                      Messenger webhook
                    </p>
                    <p className="mt-1 text-[12px] leading-6 text-[var(--text-muted)]">
                      Re-subscribes this Page to messages, postbacks, and echoes.
                    </p>
                    <button
                      type="button"
                      onClick={() => void repairMessengerWebhook()}
                      disabled={repairingMessengerWebhook || loading}
                      className={`${secondaryButtonClass} mt-3 w-full`}
                    >
                      {repairingMessengerWebhook ? "Repairing..." : "Repair Webhook"}
                    </button>
                  </div>
                </div>
              </SettingsSection>
            </div>
          </>
        )}
      </div>
      <LoadingModal
        isOpen={cleaningStorage || repairingMessengerWebhook || savingWelcomeSequence || savingAutoReplyIgnorePattern || uploadingWelcomeImage || savingLeadCapture}
        message={
          repairingMessengerWebhook
            ? "Repairing Messenger webhook..."
            : uploadingWelcomeImage
            ? "Uploading image to Messenger..."
            : savingWelcomeSequence
            ? "Saving first reply sequence..."
            : savingLeadCapture
            ? "Saving lead capture..."
            : savingAutoReplyIgnorePattern
            ? "Saving AI conversation controls..."
            : "Cleaning old data..."
        }
      />
    </>
  );
}
