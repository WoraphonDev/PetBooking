import { Suspense } from "react";
import { CareTasksScreen } from "@/components/c-16/care-tasks-screen";
export default function HotelTasksPage() {
  return (
    <Suspense>
      <CareTasksScreen />
    </Suspense>
  );
}
