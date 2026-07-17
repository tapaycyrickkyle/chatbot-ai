"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBars,
  faBoxOpen,
  faComments,
  faRightFromBracket,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useToast } from "@/app/_components/ToastProvider";
import LoadingModal from "@/app/_components/LoadingModal";
import chatbotWebIcon from "../../chatbot-web-icon.png";

type OwnerShellProps = {
  children: ReactNode;
  title: string;
  description: string;
};

const navItems = [
  { label: "Orders", href: "/owner/orders", icon: faBoxOpen },
  { label: "Conversations", href: "/owner/conversations", icon: faComments },
];

export default function OwnerShell({ children, title, description }: OwnerShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { showToast } = useToast();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const isSidebarExpanded = isSidebarOpen || isSidebarHovered;

  useEffect(() => {
    const syncViewport = () => {
      if (window.innerWidth >= 640) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarHovered(false);
      }
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);

    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  const logout = async () => {
    setIsLoggingOut(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signOutError } = await supabase.auth.signOut();

      if (
        signOutError &&
        !signOutError.message.toLowerCase().includes("refresh token not found")
      ) {
        throw signOutError;
      }

      const response = await fetch("/api/auth/admin/logout", { method: "POST" });

      if (!response.ok) {
        throw new Error("Failed to log out");
      }

      router.push("/sign-in");
      router.refresh();
    } catch (error) {
      console.error(error);
      showToast({ tone: "error", message: "Failed to log out. Please try again." });
      setIsLoggingOut(false);
    }
  };

  return (
    <main className="page-enter flex min-h-screen bg-background text-foreground">
      {isSidebarOpen ? (
        <button
          type="button"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/35 sm:hidden"
          aria-label="Close sidebar overlay"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-[calc(100vw-1rem)] max-w-[274px] flex-col border-l border-[var(--border)] bg-[var(--surface)] transition-[width,transform] duration-200 sm:left-0 sm:right-auto sm:z-20 sm:border-l-0 sm:border-r sm:translate-x-0 ${
          isSidebarOpen ? "translate-x-0" : "translate-x-full sm:translate-x-0"
        } ${isSidebarExpanded ? "sm:w-[274px]" : "sm:w-[84px]"}`}
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
      >
        <div className={isSidebarExpanded ? "px-5 py-6" : "px-3 py-5"}>
          <div className={`flex ${isSidebarExpanded ? "items-start justify-between gap-4" : "flex-col items-center gap-3"}`}>
            <div className={`flex ${isSidebarExpanded ? "items-center gap-3" : "flex-col items-center gap-3"}`}>
              <Image
                src={chatbotWebIcon}
                alt="AI Inbox"
                className={`${isSidebarExpanded ? "h-10 w-10" : "h-11 w-11"} rounded-md object-cover`}
                priority
              />
              {isSidebarExpanded ? (
              <div>
                <h2 className="text-[1.25rem] font-extrabold leading-tight text-[var(--text-primary)]">
                  AI Inbox
                </h2>
                <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                  Owner workspace
                </p>
              </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center text-[var(--text-primary)] transition-colors hover:text-[var(--accent-bright)] sm:hidden"
              aria-label="Close sidebar"
            >
              <FontAwesomeIcon aria-hidden="true" className="h-4 w-4" icon={faXmark} />
            </button>
          </div>
          {isSidebarExpanded ? (
          <p className="mt-4 text-[13px] text-[var(--text-muted)]">
            Review orders and control AI handoff.
          </p>
          ) : null}
        </div>

        <nav className="px-4">
          <ul className="space-y-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={item.label}
                    onClick={() => setIsSidebarOpen(false)}
                    className={`flex h-11 items-center rounded-md border text-[13px] font-semibold transition-colors ${
                      isSidebarExpanded ? "justify-start gap-3 px-3" : "justify-center px-2.5"
                    } ${
                      isActive
                        ? "border-transparent bg-[var(--surface-strong)] text-[var(--text-primary)] shadow-sm"
                        : "border-transparent bg-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface-strong)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <FontAwesomeIcon aria-hidden="true" className="h-4 w-4" icon={item.icon} />
                    {isSidebarExpanded ? <span>{item.label}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-auto">
          <button
            type="button"
            onClick={() => void logout()}
            disabled={isLoggingOut}
            title="Logout"
            className={`flex h-11 w-full items-center rounded-md border border-transparent bg-transparent text-[13px] font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--border)] hover:bg-[var(--surface-strong)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-70 ${
              isSidebarExpanded ? "justify-start gap-3 px-3" : "justify-center px-2.5"
            }`}
          >
            <FontAwesomeIcon aria-hidden="true" className="h-4 w-4" icon={faRightFromBracket} />
            {isSidebarExpanded ? (
              <span>{isLoggingOut ? "Logging out..." : "Logout"}</span>
            ) : null}
          </button>
        </div>
      </aside>

      <div className={`min-w-0 flex-1 transition-[padding] duration-200 ${
        isSidebarExpanded ? "sm:pl-[274px]" : "sm:pl-[84px]"
      }`}>
        <header className="border-b border-[var(--border)] bg-background px-3 py-4 sm:px-8 lg:px-10">
          <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[1.15rem] font-extrabold text-[var(--text-primary)] sm:text-[1.35rem]">
                {title}
              </h1>
              <p className="mt-1 text-[13px] text-[var(--text-muted)]">{description}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-[var(--text-primary)] transition-colors hover:text-[var(--accent-bright)] sm:hidden"
              aria-label="Open sidebar"
            >
              <FontAwesomeIcon aria-hidden="true" className="h-4 w-4" icon={faBars} />
            </button>
          </div>
        </header>
        <section className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-8 sm:py-6 lg:px-10">
          {children}
        </section>
      </div>
      <LoadingModal isOpen={isLoggingOut} message="Logging out..." />
    </main>
  );
}
