import { Suspense } from "react";
import { OccupancyScreen } from "@/components/c-25/occupancy-screen";

export default function OccupancyPage() {
  return (
    <Suspense>
      <OccupancyScreen />
    </Suspense>
  );
}
