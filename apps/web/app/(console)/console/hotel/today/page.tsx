import { Suspense } from "react";
import { StaysTodayScreen } from "@/components/c-14/stays-today-screen";
export default function HotelTodayPage() {
  return (
    <Suspense>
      <StaysTodayScreen />
    </Suspense>
  );
}
