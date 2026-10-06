import { PetsList } from "@/components/l-03/pets-list";

export default async function MyPetsPage({ params }: { params: Promise<{ branchSlug: string }> }) {
  return <PetsList branchSlug={(await params).branchSlug} />;
}
