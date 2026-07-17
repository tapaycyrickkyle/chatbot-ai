"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBars,
  faBoxOpen,
  faComments,
  faRightFromBracket,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useToast } from "@/app/_components/ToastProvider";
import LoadingModal from "@/app/_components/LoadingModal";

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
        className={`fixed inset-y-0 right-0 z-40 flex w-[calc(100vw-1rem)] max-w-[248px] flex-col border-l border-[var(--border)] bg-[var(--surface)] px-4 py-5 transition-transform duration-200 sm:left-0 sm:right-auto sm:z-20 sm:w-[248px] sm:border-l-0 sm:border-r sm:translate-x-0 ${
          isSidebarOpen ? "translate-x-0" : "translate-x-full sm:translate-x-0"
        }`}
      >
        <div className="border-b border-[var(--border)] pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-bright)]">
                Owner workspace
              </p>
              <h2 className="mt-1 text-[1.15rem] font-extrabold text-[var(--text-primary)]">
                AI Inbox
              </h2>
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
        </div>

        <nav className="mt-5">
          <ul className="space-y-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={item.label}
                    onClick={() => setIsSidebarOpen(false)}
                    className={`flex h-11 items-center justify-start gap-3 rounded-md border px-3 text-[13px] font-semibold transition-colors ${
                      isActive
                        ? "border-transparent bg-[var(--surface-strong)] text-[var(--text-primary)] shadow-sm"
                        : "border-transparent bg-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface-strong)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <FontAwesomeIcon aria-hidden="true" className="h-4 w-4" icon={item.icon} />
                    <span>{item.label}</span>
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
            className="flex h-11 w-full items-center justify-start gap-3 rounded-md border border-transparent bg-transparent px-3 text-[13px] font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--border)] hover:bg-[var(--surface-strong)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            <FontAwesomeIcon aria-hidden="true" className="h-4 w-4" icon={faRightFromBracket} />
            <span>{isLoggingOut ? "Logging out..." : "Logout"}</span>
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1 sm:pl-[248px]">
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
