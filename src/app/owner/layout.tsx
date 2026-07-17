import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_ACCESS_TOKEN_COOKIE, verifyBusinessOwnerAccessToken } from "@/lib/admin-auth";

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const owner = await verifyBusinessOwnerAccessToken(
    cookieStore.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value
  );

  if (!owner) {
    redirect("/sign-in");
  }

  return children;
}
