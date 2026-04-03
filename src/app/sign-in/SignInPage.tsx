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
        const { error: signOutError } = await supabase.auth.signOut();
        if (
          signOutError &&
          !signOutError.message.toLowerCase().includes("refresh token not found")
        ) {
          console.error(signOutError);
        }
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
    <main className="page-enter flex min-h-screen flex-col bg-[#171717] text-[#f3f4f6]">
      <section className="flex flex-1 items-start justify-center px-4 pt-14 pb-10 sm:px-6 sm:pt-16">
        <div className="w-full max-w-[420px] panel-enter">
          <div className="mb-8 text-center">
            <h1
              className="text-[1.5rem] font-extrabold leading-tight tracking-[-0.03em] sm:text-[1.6rem]"
              style={{ color: "var(--accent-text)" }}
            >
              Business Chatbot
            </h1>
            <p className="mx-auto mt-3 max-w-[320px] text-[14px] leading-6 text-[#a1a1aa]">
              Sign in to manage your Facebook Page chatbot and connected client
              workflows.
            </p>
          </div>

          <div className="rounded-2xl border border-[#2a2a2a] bg-[#1d1d1d] px-5 py-6 shadow-[0_22px_56px_rgba(0,0,0,0.34)] sm:px-6 sm:py-6 card-hover">
            <form className="space-y-4.5" onSubmit={handleSubmit}>
              <div className="border-b border-[#2a2a2a] pb-4 text-center">
                <h2 className="text-[1.5rem] font-extrabold tracking-[-0.04em] text-[#f3f4f6]">
                  Sign In
                </h2>
              </div>

              <div className="space-y-1.5">
                <label
                  className="block text-[13px] font-medium text-[#d4d4d8]"
                  htmlFor="email"
                >
                  Email Address
                </label>
                <div className="group relative">
                  <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[#8a8a8f] transition-colors group-focus-within:text-[#006139]">
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
                    className="w-full rounded-xl border border-[#303030] bg-[#171717] py-2.5 pr-4 pl-10 text-[15px] text-[#f3f4f6] placeholder:text-[#8a8a8f] focus:border-[#006139] focus:outline-none focus:ring-2 focus:ring-[#006139]/20"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
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
                  <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[#8a8a8f] transition-colors group-focus-within:text-[#006139]">
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
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-[#303030] bg-[#171717] py-2.5 pr-12 pl-10 text-[15px] text-[#f3f4f6] placeholder:text-[#8a8a8f] focus:border-[#006139] focus:outline-none focus:ring-2 focus:ring-[#006139]/20"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md border-none p-1 text-[#8a8a8f] transition-colors hover:text-[#3ECF8E]"
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
                <p className="rounded-xl border border-[#4a1f1f] bg-[#221313] px-4 py-3 text-[13px] text-[#ffb4b4]">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-3 w-full rounded-xl border border-[#3ECF8E] bg-[#006139] py-2.5 text-[15px] font-semibold text-white transition-colors hover:border-[#3ECF8E] hover:bg-[#0a7a4a] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
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

