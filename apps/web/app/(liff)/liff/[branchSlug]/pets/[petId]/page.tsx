import { PetDetailPage } from "@/components/l-03/pet-pages";

export default async function PetRoute({ params }: { params: Promise<{ branchSlug: string; petId: string }> }) {
  const { branchSlug, petId } = await params;
  return <PetDetailPage branchSlug={branchSlug} petId={petId} />;
}
