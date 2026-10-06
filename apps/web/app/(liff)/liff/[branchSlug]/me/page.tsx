import { ProfileScreen } from "@/components/l-15/profile-screen";

export default async function ProfilePage({ params }: { params: Promise<{ branchSlug: string }> }) {
  return <ProfileScreen branchSlug={(await params).branchSlug} />;
}
