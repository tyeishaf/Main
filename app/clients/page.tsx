import { getClients } from "@/lib/data";
import type { ClientFilter } from "@/lib/types";
import ClientsClient from "@/components/ClientsClient";

const FILTERS: ClientFilter[] = ["all", "leads", "clients", "hot", "quiet", "dnc"];

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: { q?: string; f?: string };
}) {
  const q = searchParams.q ?? "";
  const f: ClientFilter = FILTERS.includes(searchParams.f as ClientFilter)
    ? (searchParams.f as ClientFilter)
    : "all";
  const clients = await getClients(q, f);
  return <ClientsClient clients={clients} q={q} f={f} />;
}
