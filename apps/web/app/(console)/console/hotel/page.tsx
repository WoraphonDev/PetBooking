import { Suspense } from "react";
import { RoomMapScreen } from "@/components/c-13/room-map-screen";

export default function HotelPage() {
  return (
    <Suspense>
      <RoomMapScreen />
    </Suspense>
  );
}
