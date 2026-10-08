import { PayScreen } from "@/components/l-07/pay-screen";

export default async function PayDepositPage({ params }: { params: Promise<{ branchSlug: string; bookingId: string }> }) {
  const { branchSlug, bookingId } = await params;
  return <PayScreen branchSlug={branchSlug} bookingId={bookingId} />;
}
