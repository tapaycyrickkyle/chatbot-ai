import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_ACCESS_TOKEN_COOKIE, verifyAdminAccessToken } from "@/lib/admin-auth";

export default async function Home() {
  const cookieStore = await cookies();
  const session = await verifyAdminAccessToken(
    cookieStore.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value
  );

  redirect(session ? "/dashboard" : "/sign-in");
}
