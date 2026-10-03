import { Suspense } from "react";
import { BillListScreen } from "@/components/c-19/bill-list-screen";
export default function BillsPage() {
  return (
    <Suspense>
      <BillListScreen />
    </Suspense>
  );
}
