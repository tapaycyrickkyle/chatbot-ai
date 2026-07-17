import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import chatbotWebIcon from "./chatbot-web-icon.png";
import { ToastProvider } from "./_components/ToastProvider";
import "@fortawesome/fontawesome-svg-core/styles.css";
import { config } from "@fortawesome/fontawesome-svg-core";
import "./globals.css";

config.autoAddCss = false;

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Inbox",
  description: "AI Inbox workspace for Facebook Page automation, handoff, and orders.",
  icons: {
    icon: chatbotWebIcon.src,
    apple: chatbotWebIcon.src,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${poppins.className} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
