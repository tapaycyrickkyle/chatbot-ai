"use client";

import { createPortal } from "react-dom";

type LoadingModalProps = {
  isOpen: boolean;
  message?: string;
};

export default function LoadingModal({
  isOpen,
  message = "Processing...",
}: LoadingModalProps) {
  if (typeof document === "undefined" || !isOpen) {
    return null;
  }

  return createPortal(
    <div
      aria-live="polite"
      aria-modal="true"
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/65 px-3 py-4 backdrop-blur-sm sm:px-4"
      role="dialog"
    >
      <div className="my-auto flex w-full max-w-[320px] flex-col items-center rounded border border-[var(--border)] bg-[var(--surface)] px-5 py-6 text-center shadow-[0_24px_70px_rgba(0,0,0,0.42)] sm:px-6">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent-bright)]" />
        <p className="mt-4 max-w-full break-words text-[14px] font-semibold text-[var(--text-primary)]">
          {message}
        </p>
      </div>
    </div>,
    document.body
  );
}
