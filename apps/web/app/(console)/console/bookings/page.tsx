import { Suspense } from "react";
import { BookingsScreen } from "@/components/c-04/bookings-screen";
export default function BookingsPage() {
  return (
    <Suspense>
      <BookingsScreen />
    </Suspense>
  );
}
