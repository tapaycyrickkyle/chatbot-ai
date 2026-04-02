import Link from "next/link";
import type { ReactNode } from "react";
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
  return (
    <main className="dashboard-stage flex min-h-screen bg-background text-foreground">
      <aside className="panel-float hidden w-[274px] flex-col border-r border-[var(--border)] bg-[var(--surface)]/92 backdrop-blur-xl xl:flex">
        <div className="px-6 py-8">
          <div className="">
            <h2 className="text-[1.7rem] font-extrabold leading-tight tracking-[-0.03em]">
              Admin Panel
            </h2>
            <p className="mt-1.5 text-[13px] text-[var(--text-muted)]">
              Manage connected pages and monitor automation performance.
            </p>
          </div>
        </div>

        <nav className="px-4">
          <ul className="space-y-2">
            {navigationItems.map((item, index) => {
              const isActive = item.label === activeNav;

              return (
                <li key={item.label} className={index === 0 ? "animate-[slideUpSoft_500ms_cubic-bezier(0.22,1,0.36,1)]" : "animate-[slideUpSoft_500ms_cubic-bezier(0.22,1,0.36,1)] [animation-delay:60ms]"}>
                  <Link
                    href={item.href}
                    className={`nav-breathe flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left ${
                      isActive
                        ? "border-[var(--accent-bright)] bg-[linear-gradient(135deg,rgba(62,207,142,0.16),rgba(12,20,16,0.9))] text-[var(--accent-bright)] shadow-[0_14px_30px_rgba(5,39,22,0.26)]"
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

        <div className="mt-auto px-4 py-6 animate-[slideUpSoft_560ms_cubic-bezier(0.22,1,0.36,1)] [animation-delay:120ms]">
          <SidebarLogoutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="panel-float border-b border-[var(--border)] bg-background/82 px-6 py-3.5 backdrop-blur-xl sm:px-8 lg:px-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center justify-between gap-4 animate-[slideUpSoft_480ms_cubic-bezier(0.22,1,0.36,1)]">
              <h1 className="text-[1.2rem] font-black uppercase tracking-[0.14em]">
                Business Chatbot
              </h1>
              <button
                type="button"
                className="interactive-pop xl:hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-strong)]"
              >
                Menu
              </button>
            </div>

            <div className="animate-[slideUpSoft_560ms_cubic-bezier(0.22,1,0.36,1)] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <div className="relative min-w-0 flex-1 sm:max-w-[320px] lg:w-[320px]">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--text-subtle)]">
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
                    />
                  </svg>
                </div>
                <input
                  type="search"
                  placeholder={searchPlaceholder}
                  className="interactive-field w-full rounded-xl border border-[var(--border-input)] bg-background/85 py-2 pl-10 pr-4 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                />
              </div>
            </div>
          </div>
        </header>

        <section className="px-6 py-7 sm:px-8 lg:px-10">
          <div className="animate-[contentRise_620ms_cubic-bezier(0.22,1,0.36,1)]">{children}</div>
        </section>
      </div>
    </main>
  );
};

export default DashboardShell;



