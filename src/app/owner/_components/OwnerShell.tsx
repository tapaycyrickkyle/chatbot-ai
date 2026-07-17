"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBoxOpen, faComments, faRightFromBracket } from "@fortawesome/free-solid-svg-icons";
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
      <aside className="fixed inset-y-0 left-0 z-20 flex w-14 flex-col border-r border-[var(--border)] bg-[var(--surface)] px-2 py-3 sm:w-[248px] sm:px-4 sm:py-5">
        <div className="border-b border-[var(--border)] pb-4">
          <p className="hidden text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-bright)] sm:block">
            Owner workspace
          </p>
          <h2 className="mt-1 hidden text-[1.15rem] font-extrabold text-[var(--text-primary)] sm:block">
            AI Inbox
          </h2>
          <div className="flex h-10 w-10 items-center justify-center rounded border border-[var(--border)] bg-background text-[13px] font-extrabold text-[var(--accent-bright)] sm:hidden">
            AI
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
                    className={`flex h-11 items-center justify-center rounded-md border text-[13px] font-semibold transition-colors sm:justify-start sm:gap-3 sm:px-3 ${
                      isActive
                        ? "border-transparent bg-[var(--surface-strong)] text-[var(--text-primary)] shadow-sm"
                        : "border-transparent bg-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface-strong)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <FontAwesomeIcon aria-hidden="true" className="h-4 w-4" icon={item.icon} />
                    <span className="hidden sm:inline">{item.label}</span>
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
            className="flex h-11 w-full items-center justify-center rounded-md border border-transparent bg-transparent text-[13px] font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--border)] hover:bg-[var(--surface-strong)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-70 sm:gap-3 sm:px-3"
          >
            <FontAwesomeIcon aria-hidden="true" className="h-4 w-4" icon={faRightFromBracket} />
            <span className="hidden sm:inline">{isLoggingOut ? "Logging out..." : "Logout"}</span>
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1 pl-14 sm:pl-[248px]">
        <header className="border-b border-[var(--border)] bg-background px-3 py-4 sm:px-8 lg:px-10">
          <div className="mx-auto w-full max-w-6xl">
            <h1 className="text-[1.15rem] font-extrabold text-[var(--text-primary)] sm:text-[1.35rem]">
              {title}
            </h1>
            <p className="mt-1 text-[13px] text-[var(--text-muted)]">{description}</p>
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
