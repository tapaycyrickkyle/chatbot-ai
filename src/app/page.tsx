import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_ACCESS_TOKEN_COOKIE, verifyAppAccessToken } from "@/lib/admin-auth";

export default async function Home() {
  const cookieStore = await cookies();
  const session = await verifyAppAccessToken(
    cookieStore.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value
  );

  redirect(
    session ? (session.role === "admin" ? "/dashboard" : "/owner") : "/sign-in"
  );
}
