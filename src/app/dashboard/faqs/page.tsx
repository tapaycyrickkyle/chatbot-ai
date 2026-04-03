import { Suspense } from "react";
import type { Metadata } from "next";
import FaqEditorPage from "./FaqEditorPage";

export const metadata: Metadata = {
  title: "Flow Builder | Business Chatbot",
  description: "Manage chatbot flow cards and quick replies.",
};

const Page = () => {
  return (
    <Suspense fallback={null}>
      <FaqEditorPage />
    </Suspense>
  );
};

export default Page;

