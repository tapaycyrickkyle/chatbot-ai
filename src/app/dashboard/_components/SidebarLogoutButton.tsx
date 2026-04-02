"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

const SidebarLogoutButton = () => {
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
      className="interactive-pop flex w-full items-center justify-center gap-2 rounded-xl border border-[#7a2222] bg-[linear-gradient(135deg,#581313_0%,#260707_100%)] px-4 py-3 text-[13px] font-semibold text-[#ffd4d4] shadow-[0_18px_36px_rgba(48,8,8,0.32)] transition-[transform,border-color,background,color,box-shadow] duration-300 hover:border-[#d44f4f] hover:bg-[linear-gradient(135deg,#7a1818_0%,#340808_100%)] hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
    >
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
          d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6A2.25 2.25 0 0 0 5.25 5.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3-3-3-3m3 3H9"
        />
      </svg>
      <span>{isLoggingOut ? "Logging out..." : "Logout"}</span>
    </button>
  );
};

export default SidebarLogoutButton;
