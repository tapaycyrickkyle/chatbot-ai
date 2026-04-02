import { Suspense } from "react";
import type { Metadata } from "next";
import FaqEditorPage from "./FaqEditorPage";

export const metadata: Metadata = {
  title: "FAQ Editor | Chatbot AI",
  description: "Manage and organize FAQ responses for connected clients.",
};

const Page = () => {
  return (
    <Suspense fallback={null}>
      <FaqEditorPage />
    </Suspense>
  );
};

export default Page;
