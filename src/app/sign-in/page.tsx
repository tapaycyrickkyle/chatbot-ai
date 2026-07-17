import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import SignInPage from "./SignInPage";
import { ADMIN_ACCESS_TOKEN_COOKIE, verifyAppAccessToken } from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: "Sign In | AI Inbox",
  description: "Sign in to access the AI Inbox workspace.",
};

const Page = async () => {
  const cookieStore = await cookies();
  const session = await verifyAppAccessToken(
    cookieStore.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value
  );

  if (session) {
    redirect(session.role === "admin" ? "/dashboard" : "/owner");
  }

  return <SignInPage />;
};

export default Page;
