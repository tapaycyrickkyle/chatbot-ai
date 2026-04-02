import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | Business Chatbot",
  description: "Terms of Service for the Facebook Messenger chatbot service.",
};

const lastUpdated = "April 2, 2026";

const sections = [
  {
    title: "Acceptance of Terms",
    content: [
      "By accessing or using Business Chatbot, you agree to these Terms of Service.",
      "If you do not agree with these terms, you should not use the service.",
    ],
  },
  {
    title: "Service Description",
    content: [
      "Business Chatbot provides tools for connecting a Facebook Page to an automated chatbot service and managing related chatbot content and settings.",
      "We may update, improve, suspend, or limit parts of the service at any time.",
    ],
  },
  {
    title: "User Responsibilities",
    content: [
      "You are responsible for making sure you have authority to connect and manage any Facebook Page used with the service.",
      "You agree not to use the service for unlawful, misleading, abusive, or harmful activity.",
      "You are responsible for the content, instructions, and responses configured for your chatbot.",
    ],
  },
  {
    title: "Facebook and Third-Party Services",
    content: [
      "The service depends on Meta's platform and may also rely on hosting, database, or other infrastructure providers.",
      "We are not responsible for outages, policy changes, or limitations caused by Meta or other third-party services.",
    ],
  },
  {
    title: "Data and Privacy",
    content: [
      "Your use of the service is also subject to our Privacy Policy and Data Deletion Instructions pages.",
      "You are responsible for using the service in a way that complies with applicable privacy, data protection, and platform requirements, including Meta platform requirements.",
    ],
  },
  {
    title: "Termination",
    content: [
      "We may suspend or terminate access to the service if we believe the service is being misused, used unlawfully, or used in violation of these terms.",
      "You may stop using the service at any time.",
    ],
  },
  {
    title: "Disclaimer and Limitation of Liability",
    content: [
      "The service is provided on an \"as is\" and \"as available\" basis without warranties of any kind, to the extent permitted by law.",
      "To the extent permitted by law, we are not liable for indirect, incidental, special, consequential, or business-related damages resulting from the use of the service.",
    ],
  },
  {
    title: "Changes to These Terms",
    content: [
      "We may update these Terms of Service from time to time.",
      "Continued use of the service after changes take effect means you accept the updated terms.",
    ],
  },
];

export default function TermsOfServicePage() {
  return (
    <main className="page-enter min-h-screen bg-[radial-gradient(circle_at_top,_rgba(62,207,142,0.14),_transparent_32%),linear-gradient(180deg,_#171717_0%,_#121212_100%)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <section className="panel-enter overflow-hidden rounded-[28px] border border-white/10 bg-white/4 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-sm">
          <div className="border-b border-white/10 px-6 py-8 sm:px-10">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-accent-bright">
              Terms of Service
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Terms for using Business Chatbot
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-text-muted sm:text-base">
              These terms explain the rules, responsibilities, and limitations
              that apply when using Business Chatbot with a Facebook Page or
              related chatbot workflows.
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
                className="rounded-full border border-white/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-text-label hover:border-white/20 hover:text-accent-bright"
              >
                Data Deletion
              </Link>
              <Link
                href="/terms-of-service"
                className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-accent-bright"
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
                If you have questions about these terms, contact us at{" "}
                <a
                  href="mailto:tapaycyrickkyle@gmail.com"
                  className="font-medium text-accent-bright hover:text-accent-text-hover"
                >
                  tapaycyrickkyle@gmail.com
                </a>
                .
              </p>
              <p className="mt-3 text-sm leading-6 text-text-label sm:text-[15px]">
                You can also review our{" "}
                <a
                  href="/privacy-policy"
                  className="font-medium text-accent-bright hover:text-accent-text-hover"
                >
                  Privacy Policy
                </a>{" "}
                and{" "}
                <a
                  href="/data-deletion"
                  className="font-medium text-accent-bright hover:text-accent-text-hover"
                >
                  Data Deletion Instructions
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
