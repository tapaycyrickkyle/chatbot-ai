"use client";

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
  { label: "Clients", href: "/dashboard", icon: "clients" as const },
];

type DashboardShellProps = {
  children: ReactNode;
  activeNav?: "Clients";
  searchPlaceholder?: string;
  showTopBar?: boolean;
};

const DashboardShell = ({
  children,
  activeNav = "Clients",
  searchPlaceholder = "Search clients...",
  showTopBar = true,
}: DashboardShellProps) => {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const currentPathname = pathname ?? "/dashboard";
  const searchValue = searchParams?.get("q") ?? "";
  const [searchInputValue, setSearchInputValue] = useState(searchValue);
  const isDesktopSidebarExpanded = isSidebarOpen;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const storedSidebarPreference =
        window.localStorage.getItem("dashboard-sidebar-open") !== "false";

      setIsSidebarOpen(storedSidebarPreference);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("dashboard-sidebar-open", String(isSidebarOpen));
  }, [isSidebarOpen]);

  useEffect(() => {
    setSearchInputValue(searchValue);
  }, [searchValue]);

  const closeSidebarOnMobile = () => {
    if (window.innerWidth < 1280) {
      setIsSidebarOpen(false);
    }
  };

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
      {!isSidebarOpen && !showTopBar ? (
        <button
          type="button"
          onClick={() => setIsSidebarOpen(true)}
          className={`fixed left-4 z-50 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] shadow-[0_12px_28px_rgba(0,0,0,0.22)] transition-colors hover:bg-[var(--surface-strong)] xl:hidden ${showTopBar ? "top-4 xl:top-5" : "top-4"}`}
          aria-label="Open sidebar"
        >
          <span className="flex flex-col gap-1.5">
            <span className="block h-0.5 w-4 rounded-full bg-current" />
            <span className="block h-0.5 w-4 rounded-full bg-current" />
            <span className="block h-0.5 w-4 rounded-full bg-current" />
          </span>
        </button>
      ) : null}

      {isSidebarOpen ? (
        <button
          type="button"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/35 xl:hidden"
          aria-label="Close sidebar overlay"
        />
      ) : null}

      <aside
        className={`panel-enter fixed inset-y-0 left-0 z-40 flex flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-[width,transform] duration-200 xl:static xl:z-auto xl:translate-x-0 ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full xl:translate-x-0"
        } ${isDesktopSidebarExpanded ? "w-[274px]" : "xl:w-[84px]"} ${
          isSidebarOpen ? "w-[274px]" : "w-[274px] xl:w-[84px]"
        }`}
      >
        <div className={`${isDesktopSidebarExpanded ? "px-5 py-6" : "px-3 py-5 xl:px-3"} `}>
          <div className={`flex ${isDesktopSidebarExpanded ? "items-start justify-between gap-4" : "flex-col items-center gap-3"}`}>
            <div className={`flex ${isDesktopSidebarExpanded ? "items-center gap-3" : "flex-col items-center gap-3"}`}>
              <div className={`${isDesktopSidebarExpanded ? "p-0" : "p-0"}`}>
                <Image
                  src={chatbotWebIcon}
                  alt="Business Chatbot"
                  className={`${isDesktopSidebarExpanded ? "h-10 w-10" : "h-11 w-11"} rounded-xl object-cover`}
                  priority
                />
              </div>
              {isDesktopSidebarExpanded ? (
                <div>
                  <h2 className="text-[1.35rem] font-extrabold leading-tight tracking-[-0.03em]">
                    Admin Panel
                  </h2>
                  <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                    Business Chatbot
                  </p>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setIsSidebarOpen((current) => !current)}
              className={`inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface)] ${
                isDesktopSidebarExpanded ? "h-9 w-9" : "h-10 w-[calc(100%-14px)]"
              }`}
              aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              {isDesktopSidebarExpanded ? (
                <span className="relative block h-4 w-4">
                  <span className="absolute left-0 top-1/2 block h-0.5 w-4 -translate-y-1/2 rotate-45 rounded-full bg-current" />
                  <span className="absolute left-0 top-1/2 block h-0.5 w-4 -translate-y-1/2 -rotate-45 rounded-full bg-current" />
                </span>
              ) : (
                <span className="flex flex-col gap-1.5">
                  <span className="block h-0.5 w-4 rounded-full bg-current" />
                  <span className="block h-0.5 w-4 rounded-full bg-current" />
                  <span className="block h-0.5 w-4 rounded-full bg-current" />
                </span>
              )}
            </button>
          </div>

          {isDesktopSidebarExpanded ? (
            <p className="mt-4 text-[13px] text-[var(--text-muted)]">
              Manage connected pages and monitor automation performance.
            </p>
          ) : null}
        </div>

        <nav className="px-4">
          <ul className="space-y-2">
            {navigationItems.map((item) => {
              const isActive = item.label === activeNav;

              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className={`flex w-full items-center rounded-xl border py-2.5 transition-colors ${
                      isDesktopSidebarExpanded ? "justify-start gap-3 px-3.5 text-left" : "justify-center px-2.5"
                    } ${
                      isActive
                        ? "border-[var(--border)] bg-[var(--surface-strong)] text-[var(--text-primary)] shadow-sm"
                        : "border-transparent bg-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface-strong)] hover:text-[var(--text-primary)]"
                    }`}
                    onClick={closeSidebarOnMobile}
                    title={!isDesktopSidebarExpanded ? item.label : undefined}
                  >
                    <span className="flex h-5 w-5 items-center justify-center">
                      <DashboardIcon type={item.icon} />
                    </span>
                    {isDesktopSidebarExpanded ? (
                      <span className={`text-[13px] ${isActive ? "font-semibold" : "font-medium"}`}>
                        {item.label}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-auto px-4 py-6">
          <SidebarLogoutButton collapsed={!isDesktopSidebarExpanded} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {showTopBar ? (
          <header className="border-b border-[var(--border)] bg-background px-6 py-3.5 sm:px-8 lg:px-10">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center justify-between gap-4">
                <h1 className="text-[1.125rem] font-black uppercase tracking-[0.14em]">
                  Business Chatbot
                </h1>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <div className="relative min-w-0 flex-1 sm:max-w-[320px] lg:w-[320px]">
                  <input
                    type="search"
                    value={searchInputValue}
                    onChange={(event) => setSearchInputValue(event.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full rounded-xl border border-[var(--border-input)] bg-background px-4 py-2 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                </div>
              </div>
            </div>
          </header>
        ) : null}

        <section className="px-6 py-7 sm:px-8 lg:px-10">{children}</section>
      </div>
    </main>
  );
};

export default DashboardShell;
