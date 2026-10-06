import { HomeScreen } from "@/components/l-02/home-screen";

export default async function LiffHomePage({ params }: { params: Promise<{ branchSlug: string }> }) {
  return <HomeScreen branchSlug={(await params).branchSlug} />;
}
