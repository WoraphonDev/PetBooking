import { BookingsScreen } from "@/components/l-08/bookings-screen";

export default async function MyBookingsPage({ params }: { params: Promise<{ branchSlug: string }> }) {
  return <BookingsScreen branchSlug={(await params).branchSlug} />;
}
