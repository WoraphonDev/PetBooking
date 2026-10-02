"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { navigationItems } from "./navigation";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("shell-admin");
  const params = useParams();
  const items = navigationItems(typeof params.orgId === "string" ? params.orgId : undefined);
  return (
    <div className="min-h-dvh min-w-[360px] bg-background text-foreground md:flex">
      <aside className="border-b border-sidebar-border bg-sidebar text-sidebar-foreground md:w-64 md:shrink-0 md:border-r md:border-b-0">
        <div className="px-4 py-5 text-xl font-semibold">PJ-8</div>
        <nav aria-label="PJ-8" className="grid grid-cols-2 gap-2 p-3 md:grid-cols-1">
          {items.map(({ id, href }) =>
            href ? (
              <Link key={id} href={href} className="flex min-h-11 items-center rounded-lg px-3 py-2 text-sm">
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
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
