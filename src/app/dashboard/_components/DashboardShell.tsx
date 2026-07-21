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
  { label: "Owner Accounts", href: "/dashboard/owners", icon: "owners" as const },
];

type DashboardShellProps = {
  children: ReactNode;
};

const DashboardShell = ({ children }: DashboardShellProps) => {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const currentPathname = pathname ?? "/dashboard";
  const searchValue = searchParams?.get("q") ?? "";
  const [searchInputValue, setSearchInputValue] = useState(searchValue);
  const isDesktopSidebarExpanded = isDesktopViewport || isSidebarOpen;
  const activeNav = currentPathname.startsWith("/dashboard/owners")
    ? "Owner Accounts"
    : "Pages";
  const searchPlaceholder = currentPathname.includes("/conversations")
    ? "Search conversations..."
    : activeNav === "Owner Accounts"
      ? "Search owners..."
      : "Search pages...";

  useEffect(() => {
    const syncViewport = () => {
      const isDesktop = window.innerWidth >= 1280;
      setIsDesktopViewport(isDesktop);

      if (isDesktop) {
        setIsSidebarOpen(false);
      }
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);

    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    setSearchInputValue(searchValue);
  }, [searchValue]);

  const closeSidebarOnMobile = () => {
    if (!isDesktopViewport) {
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
      {isSidebarOpen && !isDesktopViewport ? (
        <button
          type="button"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/35 xl:hidden"
          aria-label="Close sidebar overlay"
        />
      ) : null}

      <aside
        className={`panel-enter fixed inset-y-0 right-0 z-40 flex w-[calc(100vw-1rem)] max-w-[274px] flex-col border-l border-[var(--border)] bg-[var(--surface)] transition-[width,transform] duration-200 xl:left-0 xl:right-auto xl:z-20 xl:w-[274px] xl:max-w-none xl:border-l-0 xl:border-r xl:translate-x-0 ${
          isSidebarOpen ? "translate-x-0" : "translate-x-full xl:translate-x-0"
        }`}
      >
        <div className={`${isDesktopSidebarExpanded ? "px-5 py-6" : "px-3 py-5 xl:px-3"} `}>
          <div className={`flex ${isDesktopSidebarExpanded ? "items-start justify-between gap-4" : "flex-col items-center gap-3"}`}>
            <div className={`flex ${isDesktopSidebarExpanded ? "items-center gap-3" : "flex-col items-center gap-3"}`}>
              <div className={`${isDesktopSidebarExpanded ? "p-0" : "p-0"}`}>
                <Image
                  src={chatbotWebIcon}
                  alt="AI Inbox"
                  className={`${isDesktopSidebarExpanded ? "h-10 w-10" : "h-11 w-11"} rounded-md object-cover`}
                  priority
                />
              </div>
              {isDesktopSidebarExpanded ? (
                <div>
                  <h2 className="text-[1.25rem] font-extrabold leading-tight">
                    AI Inbox
                  </h2>
                  <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                    Admin workspace
                  </p>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setIsSidebarOpen((current) => !current)}
              className={`inline-flex items-center justify-center text-[var(--text-primary)] transition-colors hover:text-[var(--accent-bright)] xl:hidden ${
                isDesktopSidebarExpanded ? "h-9 w-9" : "h-10 w-[calc(100%-14px)]"
              }`}
              aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              <FontAwesomeIcon aria-hidden="true" className="h-4 w-4" icon={isDesktopSidebarExpanded ? faXmark : faBars} />
            </button>
          </div>

          {isDesktopSidebarExpanded ? (
            <p className="mt-4 text-[13px] text-[var(--text-muted)]">
              Manage pages, prompts, handoff, and owner access.
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
                    className={`flex w-full items-center rounded-md border py-2.5 transition-colors ${
                      isDesktopSidebarExpanded ? "justify-start gap-3 px-3.5 text-left" : "justify-center px-2.5"
                    } ${
                      isActive
                        ? "border-transparent bg-[var(--surface-strong)] text-[var(--text-primary)] shadow-sm"
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

      <div className="flex min-w-0 flex-1 flex-col xl:pl-[274px]">
        <header className="border-b border-[var(--border)] bg-background px-4 py-3.5 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-[1rem] font-bold text-[var(--text-primary)]">
                AI Inbox Admin
              </h1>
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center text-[var(--text-primary)] transition-colors hover:text-[var(--accent-bright)] xl:hidden"
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
