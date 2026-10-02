import { ProtectedConsoleShell } from "@/components/shell-console/guard";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return ProtectedConsoleShell({ children });
}
