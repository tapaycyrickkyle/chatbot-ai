"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import SignInFooter from "./SignInFooter";

const SignInPage = () => {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError || !data.session?.access_token) {
        setError(signInError?.message || "Unable to sign in");
        return;
      }

      const response = await fetch("/api/auth/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accessToken: data.session.access_token }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        await supabase.auth.signOut();
        setError(payload?.error || "Unable to sign in");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to sign in"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="dashboard-stage relative flex min-h-screen flex-col overflow-hidden bg-[#171717] text-[#f3f4f6]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(62,207,142,0.16),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(11,92,59,0.2),_transparent_30%)]" />
      <section className="relative flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-[420px] animate-[contentRise_650ms_cubic-bezier(0.22,1,0.36,1)]">
          <div className="mb-6 text-center animate-[slideUpSoft_520ms_cubic-bezier(0.22,1,0.36,1)]">
            <div className="mx-auto mb-3 flex h-11 w-11 animate-[floatSoft_6s_ease-in-out_infinite] items-center justify-center rounded-xl border border-[#3ECF8E] bg-[#1d1d1d] shadow-[0_0_0_1px_rgba(62,207,142,0.08),0_20px_48px_rgba(0,0,0,0.28)]">
              <svg
                aria-hidden="true"
                className="h-5 w-5 text-[#3ECF8E]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 10h8M8 14h5m-7 5h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3Z"
                />
              </svg>
            </div>
            <h1 className="text-[1.5rem] font-extrabold leading-tight tracking-[-0.03em] text-[#f7f7f7] sm:text-[1.7rem]">
              Business Chatbot
            </h1>
          </div>

          <div className="panel-float rounded-2xl border border-[#2a2a2a] bg-[#1d1d1d]/96 px-5 py-6 shadow-[0_22px_56px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:px-6 sm:py-6">
            <div className="mb-5 text-center animate-[slideUpSoft_560ms_cubic-bezier(0.22,1,0.36,1)]">
              <h2 className="text-[1.35rem] font-extrabold leading-tight tracking-[-0.03em] text-[#f7f7f7] sm:text-[1.5rem]">
                Sign In
              </h2>
            </div>
            <form className="space-y-4.5" onSubmit={handleSubmit}>
              <div className="animate-[slideUpSoft_600ms_cubic-bezier(0.22,1,0.36,1)] space-y-1.5">
                <label
                  className="block text-[13px] font-medium text-[#d4d4d8]"
                  htmlFor="email"
                >
                  Email Address
                </label>
                <div className="group relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8a8a8f] transition-colors group-focus-within:text-[#006139]">
                    <svg
                      aria-hidden="true"
                      className="h-4.5 w-4.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 7.5 12 13l8-5.5M5.5 6h13A1.5 1.5 0 0 1 20 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5v-9A1.5 1.5 0 0 1 5.5 6Z"
                      />
                    </svg>
                  </span>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@company.com"
                    className="interactive-field w-full rounded-xl border border-[#303030] bg-[#171717] py-2.5 pl-10 pr-4 text-[15px] text-[#f3f4f6] placeholder:text-[#8a8a8f] focus:border-[#006139] focus:outline-none focus:ring-2 focus:ring-[#006139]/20"
                  />
                </div>
              </div>

              <div className="animate-[slideUpSoft_660ms_cubic-bezier(0.22,1,0.36,1)] space-y-1.5">
                <div className="flex items-center justify-between gap-4">
                  <label
                    className="block text-[13px] font-medium text-[#d4d4d8]"
                    htmlFor="password"
                  >
                    Password
                  </label>
                  <Link
                    href="#"
                    className="text-[13px] font-medium text-[#3aa06f] transition-colors hover:text-[#4fbe8a]"
                  >
                    Forgot Password?
                  </Link>
                </div>
                <div className="group relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8a8a8f] transition-colors group-focus-within:text-[#006139]">
                    <svg
                      aria-hidden="true"
                      className="h-4.5 w-4.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8.5 10V8a3.5 3.5 0 1 1 7 0v2m-8 0h9a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z"
                      />
                    </svg>
                  </span>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="********"
                    className="interactive-field w-full rounded-xl border border-[#303030] bg-[#171717] py-2.5 pl-10 pr-12 text-[15px] text-[#f3f4f6] placeholder:text-[#8a8a8f] focus:border-[#006139] focus:outline-none focus:ring-2 focus:ring-[#006139]/20"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((value) => !value)}
                    className="interactive-pop absolute right-3 top-1/2 -translate-y-1/2 rounded-md border-none p-1 text-[#8a8a8f] transition-colors hover:text-[#3ECF8E]"
                  >
                    {showPassword ? (
                      <svg
                        aria-hidden="true"
                        className="h-4.5 w-4.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 3l18 18M10.73 10.73A3 3 0 0 0 15 15m3.61 3.61A11.8 11.8 0 0 1 12 20C7 20 3.73 16.89 2 12c.78-2.2 2.03-4.08 3.7-5.49m3.03-1.72A11.72 11.72 0 0 1 12 4c5 0 8.27 3.11 10 8a12.27 12.27 0 0 1-1.67 3.06"
                        />
                      </svg>
                    ) : (
                      <svg
                        aria-hidden="true"
                        className="h-4.5 w-4.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2 12s3.27-8 10-8 10 8 10 8-3.27 8-10 8S2 12 2 12Z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error ? (
                <p className="animate-[fadeIn_220ms_ease-out] rounded-xl border border-[#4a1f1f] bg-[#221313] px-4 py-3 text-[13px] text-[#ffb4b4]">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="interactive-pop mt-3 w-full rounded-xl border border-[#3ECF8E] bg-[#006139] py-2.5 text-[15px] font-semibold text-white shadow-[0_16px_36px_rgba(4,48,28,0.3)] transition-colors hover:border-[#3ECF8E] hover:bg-[#0a7a4a] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? "Signing In..." : "Sign In"}
              </button>
            </form>
          </div>
        </div>
      </section>

      <SignInFooter />
    </main>
  );
};

export default SignInPage;
