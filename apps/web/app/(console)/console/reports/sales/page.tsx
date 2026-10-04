import { Suspense } from "react";
import { SalesReportScreen } from "@/components/c-23/sales-report-screen";
export default function SalesReportPage() {
  return (
    <Suspense>
      <SalesReportScreen />
    </Suspense>
  );
}
