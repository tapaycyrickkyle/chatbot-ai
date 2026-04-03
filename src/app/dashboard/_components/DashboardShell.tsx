"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  startTransition,
  type ChangeEvent,
  type ReactNode,
} from "react";
import DashboardIcon from "./DashboardIcons";
import SidebarLogoutButton from "./SidebarLogoutButton";

const navigationItems = [
  { label: "Clients", href: "/dashboard", icon: "clients" as const },
];

type DashboardShellProps = {
  children: ReactNode;
  activeNav?: "Clients";
  searchPlaceholder?: string;
};

const DashboardShell = ({
  children,
  activeNav = "Clients",
  searchPlaceholder = "Search clients...",
}: DashboardShellProps) => {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPathname = pathname ?? "/dashboard";
  const searchValue = searchParams?.get("q") ?? "";

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    const nextSearchParams = new URLSearchParams(searchParams?.toString());

    if (nextValue.trim()) {
      nextSearchParams.set("q", nextValue);
    } else {
      nextSearchParams.delete("q");
    }

    const nextQuery = nextSearchParams.toString();

    startTransition(() => {
      router.replace(nextQuery ? `${currentPathname}?${nextQuery}` : currentPathname);
    });
  };

  return (
    <main className="page-enter flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-[274px] flex-col border-r border-[var(--border)] bg-[var(--surface)] xl:flex panel-enter">
        <div className="px-6 py-8">
          <h2 className="text-[1.5rem] font-extrabold leading-tight tracking-[-0.03em]">
            Admin Panel
          </h2>
          <p className="mt-1.5 text-[13px] text-[var(--text-muted)]">
            Manage connected pages and monitor automation performance.
          </p>
        </div>

        <nav className="px-4">
          <ul className="space-y-2">
            {navigationItems.map((item) => {
              const isActive = item.label === activeNav;

              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                      isActive
                        ? "border-[var(--border)] bg-[var(--surface-strong)] text-[var(--text-primary)] shadow-sm"
                        : "border-transparent bg-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface-strong)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <DashboardIcon type={item.icon} />
                    <span className={`text-[13px] ${isActive ? "font-semibold" : "font-medium"}`}>
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-auto px-4 py-6">
          <SidebarLogoutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-[var(--border)] bg-background px-6 py-3.5 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-[1.125rem] font-black uppercase tracking-[0.14em]">
                Business Chatbot
              </h1>
              <button
                type="button"
                className="xl:hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-strong)]"
              >
                Menu
              </button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <div className="relative min-w-0 flex-1 sm:max-w-[320px] lg:w-[320px]">
                <input
                  type="search"
                  value={searchValue}
                  onChange={handleSearchChange}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-xl border border-[var(--border-input)] bg-background px-4 py-2 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                />
              </div>
            </div>
          </div>
        </header>

        <section className="px-6 py-7 sm:px-8 lg:px-10">{children}</section>
      </div>
    </main>
  );
};

export default DashboardShell;
