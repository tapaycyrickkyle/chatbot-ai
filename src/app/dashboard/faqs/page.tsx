import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Prompt Builder | AI Inbox",
  description: "AI instructions are managed from each connected page.",
};

const Page = () => {
  redirect("/dashboard");
};

export default Page;
