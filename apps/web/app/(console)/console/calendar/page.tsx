import { Suspense } from "react";
import { CalendarScreen } from "@/components/c-02/calendar-screen";

export default function CalendarPage() {
  return (
    <Suspense>
      <CalendarScreen />
    </Suspense>
  );
}
