"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useToast } from "@/app/_components/ToastProvider";

type OwnerShellProps = {
  children: ReactNode;
  title: string;
  description: string;
};

const navItems = [
  { label: "Orders", href: "/owner/orders" },
  { label: "Conversations", href: "/owner/conversations" },
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
    <main className="page-enter min-h-screen bg-background text-foreground">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-4 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-bright)]">
              Owner workspace
            </p>
            <h1 className="mt-1 text-[1.35rem] font-extrabold text-[var(--text-primary)]">
              {title}
            </h1>
            <p className="mt-1 text-[13px] text-[var(--text-muted)]">{description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md border px-4 py-2 text-[13px] font-semibold transition-colors ${
                    isActive
                      ? "border-[var(--accent-bright)] bg-[var(--accent)] text-white"
                      : "border-[var(--border)] bg-background text-[var(--text-primary)] hover:bg-[var(--surface-strong)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => void logout()}
              disabled={isLoggingOut}
              className="rounded-md border border-[#5a2626] bg-[#2b1717] px-4 py-2 text-[13px] font-semibold text-[#ffb4b4] transition-colors hover:bg-[#372020] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoggingOut ? "Logging out..." : "Logout"}
            </button>
          </div>
        </div>
      </header>
      <section className="mx-auto w-full max-w-6xl px-6 py-6 sm:px-8 lg:px-10">
        {children}
      </section>
    </main>
  );
}
