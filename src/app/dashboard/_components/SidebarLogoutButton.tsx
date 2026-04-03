"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type SidebarLogoutButtonProps = {
  collapsed?: boolean;
};

const SidebarLogoutButton = ({ collapsed = false }: SidebarLogoutButtonProps) => {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);

    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();

      const response = await fetch("/api/auth/admin/logout", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to log out");
      }

      router.push("/sign-in");
      router.refresh();
    } catch (error) {
      console.error(error);
      window.alert("Failed to log out. Please try again.");
      setIsLoggingOut(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleLogout()}
      disabled={isLoggingOut}
      className={`flex w-full items-center rounded-xl border border-transparent bg-[var(--surface)] text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:border-[#7a2222] hover:bg-[var(--surface)] hover:text-[#ff8f8f] disabled:cursor-not-allowed disabled:opacity-70 ${
        collapsed ? "justify-center px-2.5 py-2.5" : "justify-start gap-2 px-3.5 py-2.5"
      }`}
      title={collapsed ? (isLoggingOut ? "Logging out..." : "Logout") : undefined}
    >
      <svg
        aria-hidden="true"
        className="h-5 w-5 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6A2.25 2.25 0 0 0 5.25 5.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3-3-3-3m3 3H9"
        />
      </svg>
      {collapsed ? null : <span>{isLoggingOut ? "Logging out..." : "Logout"}</span>}
    </button>
  );
};

export default SidebarLogoutButton;

