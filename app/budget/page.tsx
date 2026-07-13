import { getBudget } from "@/lib/data";
import BudgetClient from "@/components/BudgetClient";

export const dynamic = "force-dynamic";

export default async function BudgetPage({ searchParams }: { searchParams: { m?: string } }) {
  const data = await getBudget(searchParams.m);
  return <BudgetClient data={data} />;
}
