"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faXmark } from "@fortawesome/free-solid-svg-icons";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  startTransition,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import DashboardIcon from "./DashboardIcons";
import SidebarLogoutButton from "./SidebarLogoutButton";
import chatbotWebIcon from "../../chatbot-web-icon.png";

const navigationItems = [
  { label: "Pages", href: "/dashboard", icon: "clients" as const },
];

type DashboardShellProps = {
  children: ReactNode;
};

const DashboardShell = ({ children }: DashboardShellProps) => {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const currentPathname = pathname ?? "/dashboard";
  const searchValue = searchParams?.get("q") ?? "";
  const [searchInputValue, setSearchInputValue] = useState(searchValue);
  const isSidebarExpanded = isSidebarOpen;
  const activeNav = "Pages";
  const searchPlaceholder = currentPathname.includes("/conversations")
    ? "Search conversations..."
    : "Search pages...";

  useEffect(() => {
    setSearchInputValue(searchValue);
  }, [searchValue]);

  useEffect(() => {
    if (searchInputValue === searchValue) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const nextSearchParams = new URLSearchParams(searchParams?.toString());

      if (searchInputValue.trim()) {
        nextSearchParams.set("q", searchInputValue);
      } else {
        nextSearchParams.delete("q");
      }

      const nextQuery = nextSearchParams.toString();

      startTransition(() => {
        router.replace(nextQuery ? `${currentPathname}?${nextQuery}` : currentPathname);
      });
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [currentPathname, router, searchInputValue, searchParams, searchValue]);

  return (
    <main className="page-enter flex min-h-screen bg-background text-foreground">
      {isSidebarOpen ? (
        <button
          type="button"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/35"
          aria-label="Close sidebar overlay"
        />
      ) : null}

      <aside
        className={`panel-enter fixed inset-y-0 left-0 z-40 flex w-[calc(100vw-1rem)] max-w-[274px] flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-transform duration-200 ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-5 py-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div>
                <Image
                  src={chatbotWebIcon}
                  alt="AI Inbox"
                  className="h-10 w-10 rounded-md object-cover"
                  priority
                />
              </div>
              <div>
                <h2 className="text-[1.25rem] font-extrabold leading-tight">
                  AI Inbox
                </h2>
                <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                  Admin workspace
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center text-[var(--text-primary)] transition-colors hover:text-[var(--accent-bright)]"
              aria-label="Close sidebar"
            >
              <FontAwesomeIcon aria-hidden="true" className="h-4 w-4" icon={faXmark} />
            </button>
          </div>

          <p className="mt-4 text-[13px] text-[var(--text-muted)]">
            Manage pages, prompts, handoff, and automation.
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
                    className={`flex w-full items-center justify-start gap-3 rounded-md border py-2.5 px-3.5 text-left transition-colors ${
                      isActive
                        ? "border-transparent bg-[var(--surface-strong)] text-[var(--text-primary)] shadow-sm"
                        : "border-transparent bg-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface-strong)] hover:text-[var(--text-primary)]"
                    }`}
                    onClick={() => setIsSidebarOpen(false)}
                  >
                    <span className="flex h-5 w-5 items-center justify-center">
                      <DashboardIcon type={item.icon} />
                    </span>
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
          <SidebarLogoutButton collapsed={!isSidebarExpanded} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-[var(--border)] bg-background px-4 py-3.5 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-[1rem] font-bold text-[var(--text-primary)]">
                AI Inbox Admin
              </h1>
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center text-[var(--text-primary)] transition-colors hover:text-[var(--accent-bright)]"
                aria-label="Open sidebar"
              >
                <FontAwesomeIcon aria-hidden="true" className="h-4 w-4" icon={faBars} />
              </button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <div className="relative min-w-0 flex-1 sm:max-w-[320px] lg:w-[320px]">
                <input
                  type="search"
                  value={searchInputValue}
                  onChange={(event) => setSearchInputValue(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-md border border-[var(--border-input)] bg-background px-4 py-2 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                />
              </div>
            </div>
          </div>
        </header>

        <section className="px-4 py-6 sm:px-8 lg:px-10">{children}</section>
      </div>
    </main>
  );
};

export default DashboardShell;
