"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import DashboardShell from "./_components/DashboardShell";

type ClientRow = {
  id: string;
  client_name: string;
  page_id: string;
  created_at: string;
};

type FacebookPage = {
  id: string;
  name: string;
};

const DashboardPage = () => {
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [isConnectingPageId, setIsConnectingPageId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
    if (!successMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 3200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [successMessage]);

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
        }
      } catch (error) {
        console.error(error);
      } finally {
        document.cookie = "fb_connected=; Max-Age=0; path=/; SameSite=Lax";
        window.history.replaceState({}, "", "/dashboard");
      }
    };

    void openFacebookPagesModal();
  }, [searchParams]);

  const clearFacebookPagesCookie = () => {
    document.cookie = "fb_pages=; Max-Age=0; path=/; SameSite=Lax";
  };

  const closeModal = () => {
    setShowModal(false);
    setPages([]);
    setIsConnectingPageId(null);
    clearFacebookPagesCookie();
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
          window.alert("Session expired. Please reconnect your Facebook account.");
          window.location.href = "/api/auth/facebook/login";
          return;
        }

        if (data?.error === "Client already connected") {
          window.alert("This page is already connected.");
          await loadClients();
          closeModal();
          return;
        }

        throw new Error(data?.error ?? "Failed to connect page");
      }

      await loadClients();
      closeModal();
      setSuccessMessage("Page connected successfully.");
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to connect page. See console.";
      window.alert(message);
      setIsConnectingPageId(null);
    }
  };

  const formatClientTime = (createdAt: string) => {
    if (!createdAt) {
      return "Recently added";
    }

    const date = new Date(createdAt);

    if (Number.isNaN(date.getTime())) {
      return "Recently added";
    }

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <>
      {successMessage ? (
        <div className="fixed right-5 top-5 z-[60] animate-[fadeIn_180ms_ease-out]">
          <div className="interactive-pop flex items-center gap-3 rounded-2xl border border-[var(--accent-bright)] bg-[var(--surface)] px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)]/20 text-[var(--accent-bright)]">
              <svg
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m5 13 4 4L19 7"
                />
              </svg>
            </span>
            <p className="text-[13px] font-medium text-[var(--text-primary)]">
              {successMessage}
            </p>
          </div>
        </div>
      ) : null}
      <DashboardShell activeNav="Clients" searchPlaceholder="Search clients...">
        <div className="flex flex-col gap-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-[760px] animate-[slideUpSoft_520ms_cubic-bezier(0.22,1,0.36,1)]">
              <h2 className="text-[2.1rem] font-extrabold tracking-[-0.05em] sm:text-[2.6rem]">
                Connected Clients
              </h2>
              <p className="mt-2.5 max-w-[640px] text-[14px] leading-6 text-[var(--text-muted)]">
                Manage your automated Facebook environments and FAQ logic from
                one architectural command center.
              </p>
            </div>

            <Link
              href="/api/auth/facebook/login"
              className="interactive-pop animate-[slideLeftSoft_620ms_cubic-bezier(0.22,1,0.36,1)] self-start rounded-xl border border-[var(--accent-bright)] bg-[var(--accent)] px-5 py-2.5 text-[14px] font-semibold text-white shadow-[0_18px_36px_rgba(5,39,22,0.26)] transition-colors hover:bg-[var(--accent-hover)]"
            >
              + Connect New Page
            </Link>
          </div>

          <div className="space-y-3.5">
            {isLoadingClients ? (
              <article className="animate-[slideUpSoft_560ms_cubic-bezier(0.22,1,0.36,1)] rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5 shadow-[0_14px_34px_rgba(0,0,0,0.18)]">
                <p className="text-[14px] text-[var(--text-muted)]">
                  Loading connected clients...
                </p>
              </article>
            ) : null}

            {!isLoadingClients && clients.length === 0 ? (
              <article className="animate-[slideUpSoft_560ms_cubic-bezier(0.22,1,0.36,1)] rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5 shadow-[0_14px_34px_rgba(0,0,0,0.18)]">
                <p className="text-[14px] text-[var(--text-muted)]">
                  No clients found yet. Connect a new page to get started.
                </p>
              </article>
            ) : null}

            {clients.map((client, index) => (
              <article
                key={client.id}
                className="interactive-pop rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5 shadow-[0_16px_34px_rgba(0,0,0,0.18)] transition-[transform,border-color,box-shadow,background] duration-300 hover:border-[var(--accent-bright)]/40 hover:shadow-[0_24px_54px_rgba(4,28,18,0.26)]"
                style={{
                  animation: `slideUpSoft 520ms cubic-bezier(0.22, 1, 0.36, 1) ${index * 70}ms both`,
                }}
              >
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_150px_140px] lg:items-center">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-[1.15rem] font-bold tracking-[-0.03em]">
                        {client.client_name}
                      </h3>
                      <span className="h-2 w-2 rounded-full bg-[#4ce2a2]" />
                    </div>
                    <p className="mt-1.5 text-[13px] text-[var(--text-subtle)]">
                      Page ID: {client.page_id}
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      Added
                    </p>
                    <p className="mt-1.5 text-[14px] text-[var(--text-primary)]">
                      {formatClientTime(client.created_at)}
                    </p>
                  </div>

                  <Link
                    href={`/dashboard/faqs?clientId=${encodeURIComponent(client.id)}&clientName=${encodeURIComponent(client.client_name)}`}
                    className="interactive-pop inline-flex w-fit items-center justify-center rounded-xl border border-[var(--accent-bright)] bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
                  >
                    Edit FAQs
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </DashboardShell>
      {showModal ? (
        <div className="fixed inset-0 z-50 flex animate-[fadeIn_180ms_ease-out] items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
          <div className="panel-float w-full max-w-[640px] animate-[modalIn_220ms_cubic-bezier(0.22,1,0.36,1)] overflow-hidden rounded-[1.6rem] border border-[var(--border)] bg-[var(--surface)] shadow-[0_32px_80px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-7 py-6">
              <h3 className="text-[1.75rem] font-extrabold tracking-[-0.04em]">
                Connect a New Facebook Page
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="interactive-pop rounded-full border-none p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
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
                {pages.map((page, index) => (
                  <div
                    key={page.id}
                    className="interactive-pop flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-5 py-4 transition-[transform,border-color,box-shadow] duration-300 hover:border-[var(--accent-bright)]/40 hover:shadow-[0_22px_40px_rgba(4,28,18,0.22)] sm:flex-row sm:items-center sm:justify-between"
                    style={{
                      animation: `slideUpSoft 420ms cubic-bezier(0.22, 1, 0.36, 1) ${index * 60}ms both`,
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[radial-gradient(circle_at_top_left,_rgba(62,207,142,0.24),_transparent_55%),linear-gradient(135deg,#1d3025_0%,#101010_100%)] text-[15px] font-bold text-[var(--accent-bright)]">
                        {page.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div>
                        <p className="text-[1.1rem] font-bold tracking-[-0.03em]">
                          {page.name}
                        </p>
                        <p className="mt-1 text-[14px] text-[var(--text-subtle)]">
                          ID: {page.id}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void connectPage(page)}
                      disabled={isConnectingPageId === page.id}
                      className="interactive-pop rounded-xl border border-[var(--accent-bright)] bg-[var(--accent)] px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isConnectingPageId === page.id ? "Connecting..." : "Connect"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default DashboardPage;

