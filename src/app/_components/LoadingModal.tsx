"use client";

type LoadingModalProps = {
  isOpen: boolean;
  message?: string;
};

export default function LoadingModal({
  isOpen,
  message = "Processing...",
}: LoadingModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      aria-modal="true"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm"
      role="dialog"
    >
      <div className="flex w-full max-w-[320px] flex-col items-center rounded border border-[var(--border)] bg-[var(--surface)] px-6 py-6 text-center shadow-[0_24px_70px_rgba(0,0,0,0.42)]">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent-bright)]" />
        <p className="mt-4 text-[14px] font-semibold text-[var(--text-primary)]">
          {message}
        </p>
      </div>
    </div>
  );
}
