import Link from "next/link";
import type { ReactNode } from "react";
import DashboardIcon from "./DashboardIcons";
import SidebarLogoutButton from "./SidebarLogoutButton";

const navigationItems = [
  { label: "Clients", href: "/dashboard", icon: "clients" as const },
  { label: "Account", href: "#", icon: "account" as const },
];

type DashboardShellProps = {
  children: ReactNode;
  activeNav?: "Clients" | "Account";
  searchPlaceholder?: string;
};

const DashboardShell = ({
  children,
  activeNav = "Clients",
  searchPlaceholder = "Search clients...",
}: DashboardShellProps) => {
  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-[274px] flex-col border-r border-[var(--border)] bg-[var(--surface)] xl:flex">
        <div className="px-6 py-8">
          <h2 className="text-[1.7rem] font-extrabold leading-tight tracking-[-0.03em]">
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
                        ? "border-[var(--accent-bright)] bg-[var(--surface-strong)] text-[var(--accent-bright)]"
                        : "border-transparent bg-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface-strong)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <DashboardIcon type={item.icon} />
                    <span className="text-[13px] font-medium">{item.label}</span>
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
              <h1 className="text-[1.2rem] font-black uppercase tracking-[0.14em]">
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
                  placeholder={searchPlaceholder}
                  className="w-full rounded-xl border border-[var(--border-input)] bg-background px-4 py-2 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                />
              </div>

              <div className="flex items-center gap-4 text-[var(--text-muted)]">
                <button
                  type="button"
                  className="rounded-full border-none p-0 text-current hover:text-[var(--text-primary)]"
                  aria-label="Notifications"
                >
                  <svg
                    aria-hidden="true"
                    className="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2a6 6 0 0 0-6 6v2.11c0 .53-.21 1.04-.59 1.41L4 13v2h16v-2l-1.41-1.48a2 2 0 0 1-.59-1.41V8a6 6 0 0 0-6-6Zm0 20a3 3 0 0 0 2.82-2H9.18A3 3 0 0 0 12 22Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="rounded-full border-none p-0 text-current hover:text-[var(--text-primary)]"
                  aria-label="Account"
                >
                  <svg
                    aria-hidden="true"
                    className="h-6 w-6"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm0 4a3.5 3.5 0 1 1-3.5 3.5A3.5 3.5 0 0 1 12 6Zm0 14a7.97 7.97 0 0 1-5.71-2.4 6.5 6.5 0 0 1 11.42 0A7.97 7.97 0 0 1 12 20Z" />
                  </svg>
                </button>
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
