import { resolveAdmin } from "@app/server/http";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminShell } from "./admin-shell";

export async function ProtectedAdminShell({ children }: { children: React.ReactNode }) {
  const base = process.env.APP_BASE_URL;
  if (!base) throw new Error("APP_BASE_URL is not set");
  const req = new Request(base, { headers: await headers() });
  // Q-0024: capture time once at this request entry; the resolver constructs ctx.now.
  const now = new Date();
  try {
    await resolveAdmin(req, now);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "UNAUTHENTICATED") redirect("/admin/login");
    throw error;
  }
  return <AdminShell>{children}</AdminShell>;
}
