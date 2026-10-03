import { ReceiptScreen } from "@/components/c-20/receipt-screen";

export default async function ReceiptPage({ params }: { params: Promise<{ billId: string }> }) {
  const { billId } = await params;
  return <ReceiptScreen billId={billId} />;
}
