"use client";

import type { StaffRole } from "@app/contracts/enums";
import { ERROR_MESSAGE_TH } from "@app/contracts/errors";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { canAccess, menuItems } from "./navigation";

/** 403 view (card T-0070: role ไม่ถึง → หน้า 403); the text is the API's FORBIDDEN message */
export function ConsoleForbidden() {
  return (
    <section role="alert" className="flex flex-col items-center gap-2 py-16 text-center">
      <p className="text-4xl font-semibold text-muted-foreground">403</p>
      <p>{ERROR_MESSAGE_TH.FORBIDDEN}</p>
    </section>
  );
}

export function ConsoleShell({
  role,
  supportMode,
  shopName,
  children,
}: {
  role: StaffRole;
  supportMode: boolean;
  shopName: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("shell-console");
  const pathname = usePathname();
  return (
    <div className="flex min-h-dvh min-w-[360px] flex-col bg-background text-foreground">
      {supportMode ? (
        <div role="status" className="bg-destructive px-4 py-2 text-center text-sm font-medium text-white">
          {t("supportBanner")}
        </div>
      ) : null}
      <div className="flex-1 md:flex">
        <aside className="border-b border-sidebar-border bg-sidebar text-sidebar-foreground md:w-64 md:shrink-0 md:border-r md:border-b-0">
          <div className="truncate px-4 py-5 text-xl font-semibold">{shopName}</div>
          <nav aria-label={shopName} className="grid grid-cols-2 gap-1 p-3 md:grid-cols-1">
            {menuItems(role).map(({ id, href }) =>
              href ? (
                <Link
                  key={id}
                  href={href}
                  aria-current={pathname === href ? "page" : undefined}
                  className="flex min-h-11 items-center rounded-lg px-3 py-2 text-sm aria-[current=page]:bg-sidebar-accent"
                >
                  {t(id)}
                </Link>
              ) : (
                <button key={id} type="button" disabled className="min-h-11 rounded-lg px-3 py-2 text-left text-sm opacity-50">
                  {t(id)}
                </button>
              ),
            )}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-6">{canAccess(role, pathname) ? children : <ConsoleForbidden />}</main>
      </div>
    </div>
  );
}
