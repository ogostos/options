import { notFound } from "next/navigation";

import { TradeForm } from "@/components/TradeForm";
import { getTradeById } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function EditTradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tradeId = Number(id);
  if (!Number.isFinite(tradeId) || tradeId <= 0) {
    notFound();
  }

  const trade = await getTradeById(tradeId);
  if (!trade) {
    notFound();
  }

  return <TradeForm mode="edit" trade={trade} />;
}
