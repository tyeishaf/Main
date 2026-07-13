import { getBudget } from "@/lib/data";
import BudgetClient from "@/components/BudgetClient";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  const data = await getBudget();
  return <BudgetClient data={data} />;
}
