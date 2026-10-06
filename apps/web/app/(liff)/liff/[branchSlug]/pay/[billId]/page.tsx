import { PayBalanceScreen } from "@/components/l-14/pay-balance-screen";

export default async function PayBalancePage({ params }: { params: Promise<{ branchSlug: string; billId: string }> }) {
  const { branchSlug, billId } = await params;
  return <PayBalanceScreen branchSlug={branchSlug} billId={billId} />;
}
