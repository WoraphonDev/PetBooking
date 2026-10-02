import { ProtectedAdminShell } from "@/components/shell-admin/guard";

export default async function Layout({ children }: { children: React.ReactNode }) {
  return ProtectedAdminShell({ children });
}
