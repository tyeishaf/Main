import { getContact } from "@/lib/data";
import { textdripConfigured } from "@/lib/integrations/textdrip";
import ContactClient from "@/components/ContactClient";

export const dynamic = "force-dynamic";

export default async function ContactPage({ params }: { params: { id: string } }) {
  const contact = await getContact(params.id);
  return <ContactClient contact={contact} textdrip={textdripConfigured()} />;
}
