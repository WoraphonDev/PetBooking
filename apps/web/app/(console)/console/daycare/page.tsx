import { Suspense } from "react";
import { DaycareScreen } from "@/components/c-17/daycare-screen";

export default function DaycarePage() {
  return (
    <Suspense>
      <DaycareScreen />
    </Suspense>
  );
}
