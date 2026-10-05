import { Suspense } from "react";
import { CustomerScreen } from "@/components/c-09/customer-screen";

export default async function CustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  return (
    <Suspense>
      <CustomerScreen customerId={customerId} />
    </Suspense>
  );
}
