import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Deletion Instructions | Business Chatbot",
  description: "Instructions for requesting deletion of data used by the Facebook Messenger chatbot service.",
};

const lastUpdated = "April 2, 2026";

const steps = [
  "If you connected this app through Facebook, you may first remove the app or integration from your Facebook settings to stop future data access.",
  "Send an email to tapaycyrickkyle@gmail.com with the subject line \"Data Deletion Request\".",
  "Include the Facebook Page name or Page ID connected to the chatbot, plus any details that help identify the conversation or account you want removed.",
  "If needed, we may ask for additional information to verify the request before deleting data.",
  "Once verified, we will delete the relevant stored data from the chatbot system within a reasonable timeframe, unless we must keep limited information for legal or security reasons.",
];

export default function DataDeletionPage() {
  return (
    <main className="page-enter min-h-screen bg-[radial-gradient(circle_at_top,_rgba(62,207,142,0.14),_transparent_32%),linear-gradient(180deg,_#171717_0%,_#121212_100%)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <section className="panel-enter overflow-hidden rounded-[28px] border border-white/10 bg-white/4 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-sm">
          <div className="border-b border-white/10 px-6 py-8 sm:px-10">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-accent-bright">
              Data Deletion Instructions
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              How to request deletion of your data
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-text-muted sm:text-base">
              If you want data related to Business Chatbot to be deleted,
              follow the steps below. These instructions apply to Facebook Page
              connection data and chatbot conversation data stored to operate
              the service.
            </p>
            <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">
              Last updated: {lastUpdated}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link
                href="/privacy-policy"
                className="rounded-full border border-white/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-text-label hover:border-white/20 hover:text-accent-bright"
              >
                Privacy Policy
              </Link>
              <Link
                href="/data-deletion"
                className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-accent-bright"
              >
                Data Deletion
              </Link>
              <Link
                href="/terms-of-service"
                className="rounded-full border border-white/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-text-label hover:border-white/20 hover:text-accent-bright"
              >
                Terms of Service
              </Link>
            </div>
          </div>

          <div className="space-y-6 px-6 py-8 sm:px-10">
            <section className="rounded-2xl border border-white/8 bg-black/15 p-5 sm:p-6">
              <h2 className="text-xl font-semibold text-text-heading">
                Deletion Request Steps
              </h2>
              <ol className="mt-4 space-y-3 text-sm leading-6 text-text-label sm:text-[15px]">
                {steps.map((step, index) => (
                  <li key={step} className="flex gap-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/8 text-xs font-semibold text-accent-bright">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-2xl border border-white/8 bg-black/15 p-5 sm:p-6">
              <h2 className="text-xl font-semibold text-text-heading">
                Contact Us
              </h2>
              <p className="mt-3 text-sm leading-6 text-text-label sm:text-[15px]">
                Send deletion requests to{" "}
                <a
                  href="mailto:tapaycyrickkyle@gmail.com"
                  className="font-medium text-accent-bright hover:text-accent-text-hover"
                >
                  tapaycyrickkyle@gmail.com
                </a>
                .
              </p>
              <p className="mt-3 text-sm leading-6 text-text-label sm:text-[15px]">
                For more information about how data is collected and used, see{" "}
                <a
                  href="/privacy-policy"
                  className="font-medium text-accent-bright hover:text-accent-text-hover"
                >
                  Privacy Policy
                </a>
                .
              </p>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
