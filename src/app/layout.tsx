import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import chatbotWebIcon from "./chatbot-web-icon.png";
import { ToastProvider } from "./_components/ToastProvider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-heading",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Business Chatbot",
  description: "Business Chatbot admin dashboard for Facebook Page automation.",
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
      className={`${inter.variable} ${manrope.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
