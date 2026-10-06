import { ProtectedLiffShell } from "@/components/shell-liff/guard";

export default async function LiffBranchLayout({
  params,
  children,
}: {
  params: Promise<{ branchSlug: string }>;
  children: React.ReactNode;
}) {
  return ProtectedLiffShell({ branchSlug: (await params).branchSlug, children });
}
