import { getContact, getTextdripEnabled } from "@/lib/data";
import ContactClient from "@/components/ContactClient";

export const dynamic = "force-dynamic";

export default async function ContactPage({ params }: { params: { id: string } }) {
  const [contact, textdrip] = await Promise.all([getContact(params.id), getTextdripEnabled()]);
  return <ContactClient contact={contact} textdrip={textdrip} />;
}
