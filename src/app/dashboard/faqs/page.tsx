import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Prompt Builder | Business Chatbot",
  description: "Full AI prompt builder is the only supported chatbot mode.",
};

const Page = () => {
  redirect("/dashboard");
};

export default Page;
