"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/app/_components/ToastProvider";
import LoadingModal from "@/app/_components/LoadingModal";
import DashboardShell from "../../_components/DashboardShell";

type ClientSettings = {
  id: string;
  client_name: string;
  page_id: string;
  bot_type: "ai";
  business_info: string;
  google_sheets_webhook_url: string;
  lead_capture_fields: string;
};

function getLeadFieldList(value: string) {
  const fields = value
    .split(/\r?\n|,/)
    .map((field) => field.trim())
    .filter(Boolean);
  const uniqueFields = Array.from(new Set(fields));

  return [
    "Full Name",
    "Phone",
    ...uniqueFields.filter((field) => !["Full Name", "Phone"].includes(field)),
  ];
}

function buildAppsScript(leadFields: string[]) {
  return `const COLUMNS = ${JSON.stringify(leadFields, null, 2)};

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = JSON.parse(e.postData.contents);
  const fields = data.fields || {};

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS);
  }

  const row = COLUMNS.map(function(column) {
    if (column === "Full Name") return data.fullName || fields["Full Name"] || "";
    if (column === "Phone") return data.phone || fields["Phone"] || "";
    return fields[column] || "";
  });

  sheet.appendRow(row);

  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}`;
}

export default function ClientSettingsPage() {
  const params = useParams<{ id: string }>();
  const clientId = Array.isArray(params?.id) ? params.id[0] : params?.id ?? "";
  const { showToast } = useToast();
  const [clientName, setClientName] = useState("");
  const [pageId, setPageId] = useState("");
  const [googleSheetsWebhookUrl, setGoogleSheetsWebhookUrl] = useState("");
  const [leadCaptureFields, setLeadCaptureFields] = useState("Full Name\nPhone");
  const [newLeadField, setNewLeadField] = useState("");
  const [loading, setLoading] = useState(true);
  const [cleaningStorage, setCleaningStorage] = useState(false);
  const [savingSheetsUrl, setSavingSheetsUrl] = useState(false);
  const leadFields = getLeadFieldList(leadCaptureFields);
  const sheetColumns = leadFields;
  const generatedAppsScript = buildAppsScript(leadFields);

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
        setGoogleSheetsWebhookUrl(data.google_sheets_webhook_url || "");
        setLeadCaptureFields(data.lead_capture_fields || "Full Name\nPhone");
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
            logRetentionDays?: number;
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
            ? `Cleanup finished with ${warnings.length} skipped table${warnings.length === 1 ? "" : "s"}. Deleted ${data?.deletedRateLimitLogs ?? 0} old log rows.`
            : `Cleanup finished. Deleted ${data?.deletedRateLimitLogs ?? 0} old log rows.`,
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

  const saveGoogleSheetsWebhookUrl = async () => {
    if (!clientId) {
      return;
    }

    setSavingSheetsUrl(true);

    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          google_sheets_webhook_url: googleSheetsWebhookUrl,
          lead_capture_fields: leadCaptureFields,
        }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error || "Failed to save Google Sheets URL");
      }

      showToast({ tone: "success", message: "Lead capture settings saved." });
    } catch (error) {
      console.error(error);
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to save lead capture settings.",
      });
    } finally {
      setSavingSheetsUrl(false);
    }
  };

  const copyAppsScript = async () => {
    try {
      await navigator.clipboard.writeText(generatedAppsScript);
      showToast({ tone: "success", message: "Apps Script copied." });
    } catch (error) {
      console.error(error);
      showToast({ tone: "error", message: "Unable to copy Apps Script." });
    }
  };

  const copySheetColumns = async () => {
    try {
      await navigator.clipboard.writeText(sheetColumns.join("\t"));
      showToast({ tone: "success", message: "Sheet columns copied." });
    } catch (error) {
      console.error(error);
      showToast({ tone: "error", message: "Unable to copy Sheet columns." });
    }
  };

  const updateLeadField = (index: number, value: string) => {
    const nextFields = [...leadFields];
    nextFields[index] = value;
    setLeadCaptureFields(nextFields.join("\n"));
  };

  const removeLeadField = (index: number) => {
    const field = leadFields[index];

    if (field === "Full Name" || field === "Phone") {
      showToast({
        tone: "error",
        message: "Full Name and Phone are required fields.",
      });
      return;
    }

    const nextFields = leadFields.filter((_, fieldIndex) => fieldIndex !== index);
    setLeadCaptureFields(nextFields.join("\n"));
  };

  const addLeadField = () => {
    const nextField = newLeadField.trim();

    if (!nextField) {
      return;
    }

    if (
      leadFields.some(
        (field) => field.toLowerCase() === nextField.toLowerCase()
      )
    ) {
      showToast({ tone: "error", message: "That lead field already exists." });
      return;
    }

    setLeadCaptureFields([...leadFields, nextField].join("\n"));
    setNewLeadField("");
  };

  return (
    <DashboardShell activeNav="Pages" searchPlaceholder="Search pages..." showTopBar={false}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--accent-bright)]">
              Page Settings
            </p>
            <h1 className="mt-2 break-words text-[1.45rem] font-extrabold text-[var(--text-primary)] sm:text-[1.8rem]">
              {clientName || "Connected page"}
            </h1>
            <p className="mt-2 text-[14px] text-[var(--text-muted)]">
              Manage this page&apos;s AI instructions, handoff controls, and maintenance tools.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex w-full items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-strong)] sm:w-fit"
          >
            Back to Pages
          </Link>
        </div>

        {loading ? (
          <div className="rounded border border-[var(--border)] bg-[var(--surface)] px-5 py-5 text-[14px] text-[var(--text-muted)]">
            Loading page settings...
          </div>
        ) : (
          <div className="rounded border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded border border-[var(--border)] bg-background/80 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Page Name
                </p>
                <p className="mt-2 break-words text-[15px] font-semibold text-[var(--text-primary)]">
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
                Lead Google Sheet
              </p>
              <label
                className="mt-4 block text-[13px] font-semibold text-[var(--text-primary)]"
                htmlFor="google-sheets-webhook-url"
              >
                Google Apps Script Web App URL
              </label>
              <input
                id="google-sheets-webhook-url"
                type="url"
                value={googleSheetsWebhookUrl}
                onChange={(event) => setGoogleSheetsWebhookUrl(event.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="mt-2 w-full rounded border border-[var(--border-input)] bg-background px-3 py-2.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
              />
              <p className="mt-2 text-[12px] leading-6 text-[var(--text-muted)]">
                Leads captured from this Facebook Page will be sent to this sheet. Leave it empty to skip Google Sheets for this Page.
              </p>
              <label
                className="mt-4 block text-[13px] font-semibold text-[var(--text-primary)]"
                htmlFor="new-lead-field"
              >
                Lead Fields
              </label>
              <div className="mt-2 flex flex-col gap-2">
                {leadFields.map((field, index) => {
                  const isRequiredField = field === "Full Name" || field === "Phone";

                  return (
                    <div
                      key={`${field}-${index}`}
                      className="flex flex-col gap-2 min-[480px]:flex-row"
                    >
                      <input
                        type="text"
                        value={field}
                        onChange={(event) => updateLeadField(index, event.target.value)}
                        disabled={isRequiredField}
                        className="min-w-0 flex-1 rounded border border-[var(--border-input)] bg-background px-3 py-2.5 text-[13px] text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-80"
                      />
                      <button
                        type="button"
                        onClick={() => removeLeadField(index)}
                        disabled={isRequiredField}
                        className="inline-flex items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-col gap-2 min-[480px]:flex-row">
                <input
                  id="new-lead-field"
                  type="text"
                  value={newLeadField}
                  onChange={(event) => setNewLeadField(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addLeadField();
                    }
                  }}
                  placeholder="Email, Budget, Preferred Schedule..."
                  className="min-w-0 flex-1 rounded border border-[var(--border-input)] bg-background px-3 py-2.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                />
                <button
                  type="button"
                  onClick={addLeadField}
                  className="inline-flex items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-strong)]"
                >
                  Add Field
                </button>
              </div>
              <p className="mt-2 text-[12px] leading-6 text-[var(--text-muted)]">
                Full Name and Phone are required before the lead is sent.
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => void saveGoogleSheetsWebhookUrl()}
                  disabled={savingSheetsUrl || loading}
                  className="inline-flex w-full items-center justify-center rounded-md border border-[var(--accent-bright)] bg-[var(--accent)] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                >
                  {savingSheetsUrl ? "Saving..." : "Save Lead Settings"}
                </button>
              </div>

              <div className="mt-6 rounded border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                    Generated Google Apps Script
                  </p>
                  <div className="flex flex-col gap-2 min-[420px]:flex-row">
                    <button
                      type="button"
                      onClick={() => void copySheetColumns()}
                      className="inline-flex items-center justify-center rounded-md border border-[var(--border)] bg-background px-3 py-2 text-[12px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-strong)]"
                    >
                      Copy Columns
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyAppsScript()}
                      className="inline-flex items-center justify-center rounded-md border border-[var(--accent-bright)] bg-[var(--accent)] px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
                    >
                      Copy Script
                    </button>
                  </div>
                </div>
                <p className="mt-3 break-words text-[12px] leading-6 text-[var(--text-muted)]">
                  Columns: {sheetColumns.join(" | ")}
                </p>
                <pre className="mt-3 max-h-[360px] overflow-auto rounded border border-[var(--border)] bg-background px-3 py-3 text-[12px] leading-5 text-[var(--text-primary)]">
                  <code>{generatedAppsScript}</code>
                </pre>
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
                  className="inline-flex w-full items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-strong)] sm:w-auto"
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
                  className="inline-flex w-full items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-strong)] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                >
                  {cleaningStorage ? "Cleaning..." : "Clean Old Logs & Sessions"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <LoadingModal
        isOpen={cleaningStorage || savingSheetsUrl}
        message={savingSheetsUrl ? "Saving Google Sheets URL..." : "Cleaning old data..."}
      />
    </DashboardShell>
  );
}
