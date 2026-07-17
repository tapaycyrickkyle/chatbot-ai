import { Suspense } from "react";
import type { Metadata } from "next";
import DashboardPage from "./DashboardPage";

export const metadata: Metadata = {
  title: "Admin | AI Inbox",
  description: "Admin workspace for connected pages, prompts, and handoff.",
};

const Page = () => {
  return (
    <Suspense fallback={null}>
      <DashboardPage />
    </Suspense>
  );
};

export default Page;
