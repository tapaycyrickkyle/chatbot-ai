"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRightFromBracket } from "@fortawesome/free-solid-svg-icons";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "../../_components/ToastProvider";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type SidebarLogoutButtonProps = {
  collapsed?: boolean;
};

const SidebarLogoutButton = ({ collapsed = false }: SidebarLogoutButtonProps) => {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { showToast } = useToast();

  const handleLogout = async () => {
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
      showToast({ tone: "error", message: "Failed to log out. Please try again." });
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
      <FontAwesomeIcon aria-hidden="true" className="h-5 w-5 shrink-0" icon={faRightFromBracket} />
      {collapsed ? null : <span>{isLoggingOut ? "Logging out..." : "Logout"}</span>}
    </button>
  );
};

export default SidebarLogoutButton;
