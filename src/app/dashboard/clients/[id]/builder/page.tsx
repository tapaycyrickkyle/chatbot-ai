import { redirect } from "next/navigation";
import { getClientById } from "@/lib/database";

export default async function ClientBuilderRedirectPage(
  props: PageProps<"/dashboard/clients/[id]/builder">
) {
  const { id } = await props.params;
  const client = await getClientById(id);

  if (!client) {
    redirect("/dashboard");
  }

  redirect(`/dashboard/clients/${encodeURIComponent(client.id)}/prompt-builder`);
}
