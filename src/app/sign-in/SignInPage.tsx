"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEnvelope,
  faEye,
  faEyeSlash,
  faLock,
} from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "../_components/ToastProvider";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import SignInFooter from "./SignInFooter";

const SignInPage = () => {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError || !data.session?.access_token) {
        showToast({
          tone: "error",
          message: signInError?.message || "Unable to sign in",
        });
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
        showToast({
          tone: "error",
          message: payload?.error || "Unable to sign in",
        });
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to sign in",
      });
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
                    <FontAwesomeIcon aria-hidden="true" className="h-4.5 w-4.5" icon={faEnvelope} />
                  </span>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="emailhehe@gmail.com"
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
                    <FontAwesomeIcon aria-hidden="true" className="h-4.5 w-4.5" icon={faLock} />
                  </span>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="********"
                    className="w-full rounded-xl border border-[#303030] bg-[#171717] py-2.5 pr-12 pl-10 text-[15px] text-[#f3f4f6] placeholder:text-[#8a8a8f] focus:border-[#006139] focus:outline-none focus:ring-2 focus:ring-[#006139]/20"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md border-none p-1 text-[#8a8a8f] transition-colors hover:text-[#3ECF8E]"
                  >
                    <FontAwesomeIcon
                      aria-hidden="true"
                      className="h-4.5 w-4.5"
                      icon={showPassword ? faEyeSlash : faEye}
                    />
                  </button>
                </div>
              </div>

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
