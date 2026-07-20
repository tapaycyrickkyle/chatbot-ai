"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/app/_components/ToastProvider";
import LoadingModal from "@/app/_components/LoadingModal";
import DashboardShell from "../_components/DashboardShell";

type ClientOption = {
  id: string;
  client_name: string;
  page_id: string;
};

type OwnerAccount = {
  id: string;
  email: string;
  role: string;
  client_id: string;
  created_at: string;
  client_name: string;
  page_id: string;
};

type OwnersResponse = {
  owners?: OwnerAccount[];
  clients?: ClientOption[];
  error?: string;
};

export default function OwnerAccountsPage() {
  const { showToast } = useToast();
  const [owners, setOwners] = useState<OwnerAccount[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clientId, setClientId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingOwnerId, setDeletingOwnerId] = useState("");

  const loadOwners = useCallback(async () => {
    try {
      const response = await fetch("/api/business-owners", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as OwnersResponse | null;

      if (!response.ok) {
        throw new Error(data?.error || "Failed to load owner accounts");
      }

      const nextClients = data?.clients ?? [];
      setOwners(data?.owners ?? []);
      setClients(nextClients);
      setClientId((current) => current || nextClients[0]?.id || "");
    } catch (error) {
      console.error(error);
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to load owner accounts.",
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadOwners();
  }, [loadOwners]);

  const createOwner = async () => {
    setSaving(true);

    try {
      const response = await fetch("/api/business-owners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          client_id: clientId,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string; owner?: OwnerAccount }
        | null;

      if (!response.ok) {
        throw new Error(data?.error || "Failed to create owner account");
      }

      showToast({ tone: "success", message: "Owner account saved." });
      setEmail("");
      setPassword("");
      await loadOwners();
    } catch (error) {
      console.error(error);
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to create owner account.",
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteOwner = async (ownerId: string) => {
    setDeletingOwnerId(ownerId);

    try {
      const response = await fetch("/api/business-owners", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_id: ownerId }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error || "Failed to remove owner access");
      }

      showToast({ tone: "success", message: "Owner access removed." });
      await loadOwners();
    } catch (error) {
      console.error(error);
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to remove owner access.",
      });
    } finally {
      setDeletingOwnerId("");
    }
  };

  return (
    <DashboardShell activeNav="Owner Accounts" searchPlaceholder="Search owners..." showTopBar={false}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--accent-bright)]">
            Owner Accounts
          </p>
          <h1 className="mt-2 text-[1.55rem] font-extrabold text-[var(--text-primary)] sm:text-[1.9rem]">
            Business owner access
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[var(--text-muted)]">
            Create owner logins and assign each owner to one connected Facebook Page.
          </p>
        </div>

        <div className="rounded border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
            <div>
              <label className="block text-[13px] font-semibold text-[var(--text-primary)]" htmlFor="owner-email">
                Owner Email
              </label>
              <input
                id="owner-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="owner@example.com"
                className="mt-2 w-full rounded border border-[var(--border-input)] bg-background px-3 py-2.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[var(--text-primary)]" htmlFor="owner-password">
                Temporary Password
              </label>
              <input
                id="owner-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 6 characters"
                className="mt-2 w-full rounded border border-[var(--border-input)] bg-background px-3 py-2.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[var(--text-primary)]" htmlFor="owner-client">
                Assigned Page
              </label>
              <select
                id="owner-client"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                className="mt-2 w-full rounded border border-[var(--border-input)] bg-background px-3 py-2.5 text-[13px] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
              >
                {clients.length === 0 ? <option value="">No connected pages</option> : null}
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.client_name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => void createOwner()}
              disabled={saving || !email.trim() || !clientId}
              className="inline-flex w-full items-center justify-center rounded-md border border-[var(--accent-bright)] bg-[var(--accent)] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-70 lg:w-auto"
            >
              {saving ? "Saving..." : "Create Owner"}
            </button>
          </div>
          <p className="mt-3 text-[12px] leading-6 text-[var(--text-muted)]">
            If the Supabase Auth user already exists, leave password empty to only update the page assignment.
          </p>
        </div>

        <div className="overflow-hidden rounded border border-[var(--border)] bg-[var(--surface)]">
          <div className="border-b border-[var(--border)] px-4 py-4 sm:px-5">
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">
              Existing Owners
            </p>
          </div>
          {loading ? (
            <div className="px-5 py-5 text-[14px] text-[var(--text-muted)]">
              Loading owner accounts...
            </div>
          ) : owners.length === 0 ? (
            <div className="px-5 py-5 text-[14px] text-[var(--text-muted)]">
              No owner accounts yet.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {owners.map((owner) => (
                <div
                  key={owner.id}
                  className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="break-words text-[14px] font-semibold text-[var(--text-primary)]">
                      {owner.email}
                    </p>
                    <p className="mt-1 break-words text-[13px] text-[var(--text-muted)]">
                      {owner.client_name || "Unknown page"} {owner.page_id ? `- ${owner.page_id}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteOwner(owner.id)}
                    disabled={deletingOwnerId === owner.id}
                    className="inline-flex w-full items-center justify-center rounded-md border border-[#5a2626] bg-[#2b1111] px-4 py-2 text-[13px] font-semibold text-[#ffb4a8] transition-colors hover:bg-[#3a1717] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                  >
                    {deletingOwnerId === owner.id ? "Removing..." : "Remove Access"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <LoadingModal
        isOpen={saving || Boolean(deletingOwnerId)}
        message={saving ? "Saving owner account..." : "Removing owner access..."}
      />
    </DashboardShell>
  );
}
