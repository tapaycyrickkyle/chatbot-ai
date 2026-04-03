"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "../_components/ToastProvider";
import DashboardShell from "./_components/DashboardShell";

type ClientRow = {
  id: string;
  client_name: string;
  page_id: string;
  created_at: string;
  picture_url?: string;
};

type FacebookPage = {
  id: string;
  name: string;
  picture_url?: string;
};

const DashboardPage = () => {
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [isConnectingPageId, setIsConnectingPageId] = useState<string | null>(null);
  const [isDisconnectingClientId, setIsDisconnectingClientId] = useState<string | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<ClientRow | null>(null);
  const [disconnectConfirmation, setDisconnectConfirmation] = useState("");
  const { showToast } = useToast();

  const loadClients = async () => {
    try {
      const response = await fetch("/api/clients", { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Failed to load clients");
      }

      const data = (await response.json()) as ClientRow[];
      setClients(data);
    } catch (error) {
      console.error(error);
      setClients([]);
    } finally {
      setIsLoadingClients(false);
    }
  };

  useEffect(() => {
    void loadClients();
  }, []);

  useEffect(() => {
    const fbConnectedFromQuery = searchParams?.get("fb_connected") === "true";
    const fbConnectedFromCookie = document.cookie
      .split("; ")
      .some((row) => row === "fb_connected=true");

    if (!fbConnectedFromQuery && !fbConnectedFromCookie) {
      return;
    }

    const openFacebookPagesModal = async () => {
      try {
        const response = await fetch("/api/auth/facebook/pages", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to load Facebook pages");
        }

        const data = (await response.json()) as { pages?: FacebookPage[] };
        const nextPages = Array.isArray(data.pages) ? data.pages : [];

        if (nextPages.length > 0) {
          setPages(nextPages);
          setShowModal(true);
        } else {
          setPages([]);
          setShowModal(true);
          showToast({
            tone: "error",
            durationMs: 5200,
            message:
              "No Facebook Pages were returned for this account. Make sure you are connecting an actual Facebook Page, not just a personal profile, and that the account has page access.",
          });
        }
      } catch (error) {
        console.error(error);
        showToast({
          tone: "error",
          durationMs: 5200,
          message:
            "Unable to load Facebook Pages right now. Please reconnect your Facebook account and try again.",
        });
      } finally {
        document.cookie = "fb_connected=; Max-Age=0; path=/; SameSite=Lax";
        window.history.replaceState({}, "", "/dashboard");
      }
    };

    void openFacebookPagesModal();
  }, [searchParams, showToast]);

  const clearFacebookPagesCookie = () => {
    document.cookie = "fb_pages=; Max-Age=0; path=/; SameSite=Lax";
  };

  const closeModal = () => {
    setShowModal(false);
    setPages([]);
    setIsConnectingPageId(null);
    clearFacebookPagesCookie();
  };

  const openDisconnectModal = (client: ClientRow) => {
    setDisconnectTarget(client);
    setDisconnectConfirmation("");
  };

  const closeDisconnectModal = () => {
    if (isDisconnectingClientId) {
      return;
    }

    setDisconnectTarget(null);
    setDisconnectConfirmation("");
  };

  const connectPage = async (page: FacebookPage) => {
    setIsConnectingPageId(page.id);

    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_name: page.name,
          facebook_page_id: page.id,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;

        if (data?.error === "Missing Facebook session") {
          showToast({
            tone: "error",
            message: "Session expired. Please reconnect your Facebook account.",
          });
          window.location.href = "/api/auth/facebook/login";
          return;
        }

        if (data?.error === "Client already connected") {
          showToast({
            tone: "error",
            message: "This page is already connected.",
          });
          await loadClients();
          closeModal();
          return;
        }

        throw new Error(data?.error ?? "Failed to connect page");
      }

      await loadClients();
      closeModal();
      showToast({ tone: "success", message: "Page connected successfully." });
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to connect page. See console.";
      showToast({ tone: "error", message });
      setIsConnectingPageId(null);
    }
  };

  const disconnectClient = async () => {
    if (!disconnectTarget) {
      return;
    }

    setIsDisconnectingClientId(disconnectTarget.id);

    try {
      const response = await fetch("/api/clients", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: disconnectTarget.id,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to disconnect client");
      }

      setClients((currentClients) =>
        currentClients.filter((currentClient) => currentClient.id !== disconnectTarget.id)
      );
      showToast({ tone: "success", message: "Page disconnected successfully." });
      setDisconnectTarget(null);
      setDisconnectConfirmation("");
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to disconnect client. See console.";
      showToast({ tone: "error", message });
    } finally {
      setIsDisconnectingClientId(null);
    }
  };

  const clientQuery = (searchParams?.get("q") ?? "").trim().toLowerCase();
  const filteredClients = clients.filter((client) => {
    if (!clientQuery) {
      return true;
    }

    return [client.client_name, client.page_id].some((value) =>
      value.toLowerCase().includes(clientQuery)
    );
  });

  const formatClientTime = (createdAt: string) => {
    if (!createdAt) {
      return "Recently added";
    }

    const date = new Date(createdAt);

    if (Number.isNaN(date.getTime())) {
      return "Recently added";
    }

    const month = date.toLocaleString("en-US", {
      month: "long",
      timeZone: "UTC",
    });
    const day = date.getUTCDate();
    const year = date.getUTCFullYear();

    return `${month} ${day}, ${year}`;
  };

  const getReconnectCountdown = (createdAt: string) => {
    if (!createdAt) {
      return { label: "Unknown", tone: "muted" as const };
    }

    const connectedAt = new Date(createdAt);

    if (Number.isNaN(connectedAt.getTime())) {
      return { label: "Unknown", tone: "muted" as const };
    }

    const reconnectAt = connectedAt.getTime() + 60 * 24 * 60 * 60 * 1000;
    const remainingMs = reconnectAt - Date.now();
    const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));

    if (remainingDays <= 0) {
      return { label: "Reconnect now", tone: "danger" as const };
    }

    if (remainingDays <= 7) {
      return { label: `${remainingDays} day${remainingDays === 1 ? "" : "s"} left`, tone: "warning" as const };
    }

    return { label: `${remainingDays} days left`, tone: "safe" as const };
  };

  const canConfirmDisconnect = disconnectConfirmation.trim().toLowerCase() === "disconnect";

  return (
    <>
      <DashboardShell activeNav="Clients" searchPlaceholder="Search clients...">
        <div className="flex flex-col gap-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-[760px]">
              <h2 className="text-[2rem] font-extrabold tracking-[-0.05em] sm:text-[2.35rem]">
                Connected Clients
              </h2>
              <p className="mt-2.5 max-w-[640px] text-[14px] leading-6 text-[var(--text-muted)]">
                Manage your automated Facebook environments and FAQ logic from
                one architectural command center.
              </p>
            </div>

            <Link
              href="/api/auth/facebook/login"
              className="self-start rounded-xl border border-[var(--accent-bright)] bg-[var(--accent)] px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] shadow-[0_8px_22px_rgba(0,0,0,0.16)]"
            >
              + Connect New Page
            </Link>
          </div>

          <div className="space-y-3.5">
            {isLoadingClients ? (
              <article className="card-hover rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
                <p className="text-[14px] text-[var(--text-muted)]">
                  Loading connected clients...
                </p>
              </article>
            ) : null}

            {!isLoadingClients && clients.length === 0 ? (
              <article className="card-hover rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
                <p className="text-[14px] text-[var(--text-muted)]">
                  No clients found yet. Connect a new page to get started.
                </p>
              </article>
            ) : null}

            {!isLoadingClients && clients.length > 0 && filteredClients.length === 0 ? (
              <article className="card-hover rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
                <p className="text-[14px] text-[var(--text-muted)]">
                  No clients match your current search.
                </p>
              </article>
            ) : null}

            {filteredClients.map((client) => (
              (() => {
                const reconnectCountdown = getReconnectCountdown(client.created_at);
                return (
              <article
                key={client.id}
                className="card-hover rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5"
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border)] bg-[radial-gradient(circle_at_top_left,_rgba(62,207,142,0.2),_transparent_55%),linear-gradient(135deg,#1d3025_0%,#101010_100%)]">
                      {client.picture_url ? (
                        <Image
                          src={client.picture_url}
                          alt={`${client.client_name} page profile picture`}
                          width={56}
                          height={56}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <span className="text-[15px] font-bold text-[var(--accent-bright)]">
                          {client.client_name
                            .split(" ")
                            .map((part) => part[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5">
                        <h3 className="text-[1.125rem] font-bold tracking-[-0.03em]">
                          {client.client_name}
                        </h3>
                        <span className="h-2 w-2 rounded-full bg-[#4ce2a2]" />
                      </div>
                      <p className="mt-1.5 text-[13px] text-[var(--text-subtle)]">
                        Page ID: {client.page_id}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between lg:w-auto lg:flex-none lg:gap-6">
                    <div className="min-w-[120px]">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        Added
                      </p>
                      <p className="mt-1.5 text-[14px] text-[var(--text-primary)]">
                        {formatClientTime(client.created_at)}
                      </p>
                    </div>
                    <div className="min-w-[140px]">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        Reconnect
                      </p>
                      <p
                        className={`mt-1.5 text-[14px] font-semibold ${
                          reconnectCountdown.tone === "danger"
                            ? "text-[#ff8f8f]"
                            : reconnectCountdown.tone === "warning"
                              ? "text-[#ffd37a]"
                              : reconnectCountdown.tone === "safe"
                                ? "text-[var(--accent-bright)]"
                                : "text-[var(--text-primary)]"
                        }`}
                      >
                        {reconnectCountdown.label}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/dashboard/faqs?clientId=${encodeURIComponent(client.id)}&clientName=${encodeURIComponent(client.client_name)}`}
                        className="inline-flex w-fit items-center justify-center rounded-xl border border-[var(--accent-bright)] bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
                      >
                        Open Builder
                      </Link>
                      <button
                        type="button"
                        onClick={() => openDisconnectModal(client)}
                        disabled={isDisconnectingClientId === client.id}
                        className="inline-flex w-fit items-center justify-center rounded-xl border border-[#5a2626] bg-[#2b1717] px-4 py-2 text-[13px] font-semibold text-[#ffb4b4] transition-colors hover:bg-[#372020] disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {isDisconnectingClientId === client.id ? "Disconnecting..." : "Disconnect"}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
                );
              })()
            ))}
          </div>
        </div>
      </DashboardShell>
      {disconnectTarget ? (
        <div className="fixed inset-0 z-50 flex animate-[fadeIn_180ms_ease-out] items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-[520px] animate-[modalIn_220ms_cubic-bezier(0.22,1,0.36,1)] overflow-hidden rounded-[1.6rem] border border-[#5a2626] bg-[var(--surface)] shadow-[0_32px_80px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between border-b border-[#5a2626] px-7 py-6">
              <h3 className="text-[1.5rem] font-extrabold tracking-[-0.03em] text-[#ffdfdf]">
                Confirm Disconnect
              </h3>
              <button
                type="button"
                onClick={closeDisconnectModal}
                disabled={Boolean(isDisconnectingClientId)}
                className="rounded-full border-none p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Close disconnect modal"
              >
                <svg
                  aria-hidden="true"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 6l12 12M18 6 6 18"
                  />
                </svg>
              </button>
            </div>

            <div className="space-y-5 px-7 py-6">
              <p className="text-[15px] leading-7 text-[var(--text-label)]">
                You are about to disconnect <span className="font-semibold text-[var(--text-primary)]">{disconnectTarget.client_name}</span> and remove its connected page data and saved FAQs.
              </p>
              <p className="text-[14px] leading-6 text-[var(--text-muted)]">
                To continue, type <span className="font-semibold lowercase text-[#ffb4b4]">disconnect</span> below.
              </p>
              <input
                type="text"
                value={disconnectConfirmation}
                onChange={(event) => setDisconnectConfirmation(event.target.value)}
                placeholder="Type disconnect"
                className="w-full rounded-xl border border-[#5a2626] bg-[#171717] px-4 py-2.5 text-[15px] text-[#f3f4f6] placeholder:text-[#8a8a8f] focus:border-[#8e3434] focus:outline-none focus:ring-2 focus:ring-[#8e3434]/25"
              />
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeDisconnectModal}
                  disabled={Boolean(isDisconnectingClientId)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-2.5 text-[14px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void disconnectClient()}
                  disabled={!canConfirmDisconnect || Boolean(isDisconnectingClientId)}
                  className="rounded-xl border border-[#5a2626] bg-[#7a2222] px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#912929] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDisconnectingClientId ? "Disconnecting..." : "Disconnect Page"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {showModal ? (
        <div className="fixed inset-0 z-50 flex animate-[fadeIn_180ms_ease-out] items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-[640px] animate-[modalIn_220ms_cubic-bezier(0.22,1,0.36,1)] overflow-hidden rounded-[1.6rem] border border-[var(--border)] bg-[var(--surface)] shadow-[0_32px_80px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-7 py-6">
              <h3 className="text-[1.5rem] font-extrabold tracking-[-0.03em]">
                Connect a New Facebook Page
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full border-none p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                aria-label="Close modal"
              >
                <svg
                  aria-hidden="true"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 6l12 12M18 6 6 18"
                  />
                </svg>
              </button>
            </div>

            <div className="px-7 py-6">
              <p className="max-w-[460px] text-[15px] leading-7 text-[var(--text-label)]">
                Select a page from your Facebook account to integrate with
                Business Chatbot.
              </p>

              <div className="mt-6 space-y-4">
                {pages.length === 0 ? (
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-5 py-5">
                    <p className="text-[14px] leading-6 text-[var(--text-muted)]">
                      No Facebook Pages are available for this account yet. Make sure this account has access to a real Facebook Page and then reconnect.
                    </p>
                  </div>
                ) : null}
                {pages.map((page) => {
                  const isAlreadyConnected = clients.some(
                    (client) => client.page_id === page.id
                  );

                  return (
                    <div
                      key={page.id}
                      className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border)] bg-[radial-gradient(circle_at_top_left,_rgba(62,207,142,0.24),_transparent_55%),linear-gradient(135deg,#1d3025_0%,#101010_100%)]">
                          {page.picture_url ? (
                            <Image
                              src={page.picture_url}
                              alt={`${page.name} page profile picture`}
                              width={56}
                              height={56}
                              className="h-full w-full object-cover"
                              unoptimized
                            />
                          ) : (
                            <span className="text-[15px] font-bold text-[var(--accent-bright)]">
                              {page.name
                                .split(" ")
                                .map((part) => part[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="text-[1.125rem] font-bold tracking-[-0.03em]">
                            {page.name}
                          </p>
                          <p className="mt-1 text-[14px] text-[var(--text-subtle)]">
                            ID: {page.id}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={isAlreadyConnected ? undefined : () => void connectPage(page)}
                        disabled={isAlreadyConnected || isConnectingPageId === page.id}
                        className={`rounded-xl px-5 py-2.5 text-[14px] font-semibold transition-colors disabled:cursor-not-allowed ${
                          isAlreadyConnected
                            ? "border border-[#2f5f49] bg-[#173126] text-[#9ce3c1] opacity-80"
                            : "border border-[var(--accent-bright)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-70"
                        }`}
                      >
                        {isAlreadyConnected
                          ? "Connected"
                          : isConnectingPageId === page.id
                            ? "Connecting..."
                            : "Connect"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default DashboardPage;


