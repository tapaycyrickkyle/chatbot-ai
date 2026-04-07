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

  if (client.bot_type === "ai") {
    redirect(`/dashboard/clients/${encodeURIComponent(client.id)}/prompt-builder`);
  }

  redirect(
    `/dashboard/faqs?clientId=${encodeURIComponent(client.id)}&clientName=${encodeURIComponent(client.client_name)}`
  );
}
