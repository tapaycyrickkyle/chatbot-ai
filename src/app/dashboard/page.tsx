import { Suspense } from "react";
import type { Metadata } from "next";
import DashboardPage from "./DashboardPage";

export const metadata: Metadata = {
  title: "Admin Panel | Business Chatbot",
  description: "Secretary dashboard aligned with the project login page design system.",
};

const Page = () => {
  return (
    <Suspense fallback={null}>
      <DashboardPage />
    </Suspense>
  );
};

export default Page;
