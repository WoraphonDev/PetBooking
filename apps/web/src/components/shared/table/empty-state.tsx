"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "../../ui/button.tsx";

export type EmptyAction = { label: string } & ({ href: string; onClick?: never } | { onClick: () => void; href?: never });

/** 06 กติการ่วม — Empty: message + the screen's main action. */
export function EmptyState({ message, action, icon }: { message?: string; action?: EmptyAction; icon?: ReactNode }) {
  const t = useTranslations("common");
  return (
    <div data-slot="empty-state" className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      <p className="text-sm text-muted-foreground">{message ?? t("empty")}</p>
      {action ? (
        action.href !== undefined ? (
          <Button asChild className="h-11">
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ) : (
          <Button type="button" className="h-11" onClick={action.onClick}>
            {action.label}
          </Button>
        )
      ) : null}
    </div>
  );
}
