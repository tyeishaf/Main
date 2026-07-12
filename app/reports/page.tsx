import { getReports } from "@/lib/data";
import ReportsView from "@/components/ReportsView";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const data = await getReports();
  return <ReportsView data={data} />;
}
