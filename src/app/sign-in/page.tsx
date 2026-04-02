import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import SignInPage from "./SignInPage";
import { ADMIN_ACCESS_TOKEN_COOKIE, verifyAdminAccessToken } from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: "Sign In | Chatbot AI",
  description: "Sign in to access the Chatbot AI dashboard.",
};

const Page = async () => {
  const cookieStore = await cookies();
  const session = await verifyAdminAccessToken(
    cookieStore.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value
  );

  if (session) {
    redirect("/dashboard");
  }

  return <SignInPage />;
};

export default Page;
