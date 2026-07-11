import { getContact } from "@/lib/data";
import ContactClient from "@/components/ContactClient";

export default async function ContactPage({ params }: { params: { id: string } }) {
  const contact = await getContact(params.id);
  return <ContactClient contact={contact} />;
}
