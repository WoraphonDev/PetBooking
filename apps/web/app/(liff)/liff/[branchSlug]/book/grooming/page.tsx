import { BookGroomScreen } from "@/components/l-04/book-groom-screen";

export default async function LiffBookGroomingPage({ params }: { params: Promise<{ branchSlug: string }> }) {
  return <BookGroomScreen branchSlug={(await params).branchSlug} />;
}
