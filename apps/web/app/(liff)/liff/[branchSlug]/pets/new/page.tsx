import { NewPetPage } from "@/components/l-03/pet-pages";

export default async function NewPetRoute({ params }: { params: Promise<{ branchSlug: string }> }) {
  return <NewPetPage branchSlug={(await params).branchSlug} />;
}
