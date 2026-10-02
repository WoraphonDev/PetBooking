import { AuthMeRequest, AuthMeResponse } from "@app/contracts/endpoints/auth.me";
import { withStaff } from "@app/server/http";
import { authMe } from "@app/server/services/auth/me";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ConsoleForbidden, ConsoleShell } from "./console-shell";

// resolveStaff is not exported by @app/server; the auth.me pipeline (withStaff) is the same sid check + StaffMe (role, supportMode).
const me = withStaff("auth.me", { query: AuthMeRequest }, authMe);

/** Server guard for /console/*: sid session → shell; none/expired → /login; suspended org (FORBIDDEN) → 403 view. */
export async function ProtectedConsoleShell({ children }: { children: React.ReactNode }) {
  const base = process.env.APP_BASE_URL;
  if (!base) throw new Error("APP_BASE_URL is not set");
  const res = await me(new Request(new URL("/console", base), { headers: await headers() }));
  if (res.status === 401) redirect("/login");
  if (res.status === 403) return <ConsoleForbidden />;
  if (!res.ok) throw new Error(`console guard: auth.me answered ${res.status}`);
  const staffMe = AuthMeResponse.parse(await res.json());
  return (
    <ConsoleShell role={staffMe.staff.role} supportMode={staffMe.supportMode} shopName={staffMe.branch.name}>
      {children}
    </ConsoleShell>
  );
}
