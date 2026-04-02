import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Business Chatbot",
  description: "Privacy policy for the Facebook Messenger chatbot service.",
};

const lastUpdated = "April 2, 2026";

const sections = [
  {
    title: "Information We Collect",
    content: [
      "To operate the chatbot service, we may store Facebook Page IDs, Page Access Tokens, and conversation data exchanged with the chatbot.",
      "Conversation data can include message content, timestamps, and other basic metadata needed to respond to users and support the service.",
    ],
  },
  {
    title: "How We Use Information",
    content: [
      "We use this information solely to connect the chatbot to your Facebook Page, send and receive messages, maintain chatbot functionality, and support service operations.",
      "We do not use this information for unrelated marketing, profiling, or any purpose outside operating the chatbot service.",
    ],
  },
  {
    title: "Data Sharing",
    content: [
      "We do not sell or rent your data to third parties.",
      "We may process information through Meta and trusted service providers, such as hosting and database providers, only as needed to operate, maintain, and secure the chatbot service.",
    ],
  },
  {
    title: "User Rights and Data Deletion",
    content: [
      "If you want your data deleted, you can request deletion by contacting the service operator associated with this chatbot and providing enough information to identify the relevant Facebook Page or conversation.",
      "Upon receiving and verifying a deletion request, we will remove the connected Facebook Page data and related chatbot records stored in our system within a reasonable timeframe, subject to any legal or security obligations.",
      "Detailed deletion instructions are available on our Data Deletion Instructions page.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="page-enter min-h-screen bg-[radial-gradient(circle_at_top,_rgba(62,207,142,0.14),_transparent_32%),linear-gradient(180deg,_#171717_0%,_#121212_100%)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <section className="panel-enter overflow-hidden rounded-[28px] border border-white/10 bg-white/4 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-sm">
          <div className="border-b border-white/10 px-6 py-8 sm:px-10">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-accent-bright">
              Privacy Policy
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              How this chatbot handles data
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-text-muted sm:text-base">
              This Privacy Policy explains how Business Chatbot collects, uses, and
              protects information when the service is connected to a Facebook
              Page.
            </p>
            <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">
              Last updated: {lastUpdated}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link
                href="/privacy-policy"
                className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-accent-bright"
              >
                Privacy Policy
              </Link>
              <Link
                href="/data-deletion"
                className="rounded-full border border-white/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-text-label hover:border-white/20 hover:text-accent-bright"
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
            {sections.map((section) => (
              <section
                key={section.title}
                className="rounded-2xl border border-white/8 bg-black/15 p-5 sm:p-6"
              >
                <h2 className="text-xl font-semibold text-text-heading">
                  {section.title}
                </h2>
                <div className="mt-3 space-y-3 text-sm leading-6 text-text-label sm:text-[15px]">
                  {section.content.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}

            <section className="rounded-2xl border border-white/8 bg-black/15 p-5 sm:p-6">
              <h2 className="text-xl font-semibold text-text-heading">
                Contact Us
              </h2>
              <p className="mt-3 text-sm leading-6 text-text-label sm:text-[15px]">
                For privacy questions or data deletion requests, contact us at{" "}
                <a
                  href="mailto:tapaycyrickkyle@gmail.com"
                  className="font-medium text-accent-bright hover:text-accent-text-hover"
                >
                  tapaycyrickkyle@gmail.com
                </a>
                .
              </p>
              <p className="mt-3 text-sm leading-6 text-text-label sm:text-[15px]">
                For step-by-step deletion instructions, visit{" "}
                <a
                  href="/data-deletion"
                  className="font-medium text-accent-bright hover:text-accent-text-hover"
                >
                  Data Deletion
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
