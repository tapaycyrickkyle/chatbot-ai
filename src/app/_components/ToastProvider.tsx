"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ToastTone = "success" | "error";

type ToastInput = {
  message: string;
  tone?: ToastTone;
  durationMs?: number;
};

type ToastRecord = {
  id: string;
  message: string;
  tone: ToastTone;
  durationMs: number;
  isLeaving: boolean;
};

type ToastContextValue = {
  showToast: (toast: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const EXIT_ANIMATION_MS = 220;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((currentToasts) =>
      currentToasts.map((toast) =>
        toast.id === id ? { ...toast, isLeaving: true } : toast
      )
    );

    window.setTimeout(() => {
      setToasts((currentToasts) =>
        currentToasts.filter((toast) => toast.id !== id)
      );
    }, EXIT_ANIMATION_MS);
  }, []);

  const showToast = useCallback(
    ({ message, tone = "success", durationMs = 3200 }: ToastInput) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      setToasts((currentToasts) => [
        ...currentToasts,
        { id, message, tone, durationMs, isLeaving: false },
      ]);
    },
    []
  );

  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }

    const timeoutIds = toasts
      .filter((toast) => !toast.isLeaving)
      .map((toast) =>
        window.setTimeout(() => {
          removeToast(toast.id);
        }, toast.durationMs)
      );

    return () => {
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [removeToast, toasts]);

  const contextValue = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex max-w-[calc(100vw-2.5rem)] flex-col items-end gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto min-w-[280px] max-w-[360px] ${
              toast.isLeaving ? "animate-[toastOut_220ms_ease-in_forwards]" : "animate-[toastIn_260ms_cubic-bezier(0.18,0.89,0.32,1.28)]"
            }`}
          >
            <div
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.28)] ${
                toast.tone === "success"
                  ? "border-[var(--accent-bright)] bg-[var(--surface)]"
                  : "border-[#6a2d2d] bg-[#2b1717]"
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  toast.tone === "success"
                    ? "bg-[var(--accent)]/20 text-[var(--accent-bright)]"
                    : "bg-[#5a2626]/60 text-[#ffc1c1]"
                }`}
              >
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  {toast.tone === "success" ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                  ) : (
                    <>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v5" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16h.01" />
                    </>
                  )}
                </svg>
              </span>
              <p
                className={`text-[13px] font-medium ${
                  toast.tone === "success"
                    ? "text-[var(--text-primary)]"
                    : "text-[#ffd4d4]"
                }`}
              >
                {toast.message}
              </p>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within a ToastProvider.");
  }

  return context;
}
