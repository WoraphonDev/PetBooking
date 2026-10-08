import { RegisterScreen } from "@/components/l-01/register-screen";

export default async function LiffRegisterPage({ params }: { params: Promise<{ branchSlug: string }> }) {
  return <RegisterScreen branchSlug={(await params).branchSlug} fake={process.env.LINE_FAKE === "1"} />;
}
