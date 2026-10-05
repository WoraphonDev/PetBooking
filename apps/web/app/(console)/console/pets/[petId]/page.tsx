import { Suspense } from "react";
import { PetScreen } from "@/components/c-11/pet-screen";

export default async function PetPage({ params }: { params: Promise<{ petId: string }> }) {
  const { petId } = await params;
  return (
    <Suspense>
      <PetScreen petId={petId} />
    </Suspense>
  );
}
