"use client";

import type { PublicBranchResponse } from "@app/contracts/endpoints/public.branch";
import { ERROR_MESSAGE_TH } from "@app/contracts/errors";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/api";
import { liffSignIn } from "@/lib/liff";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { menuItems, routeFor } from "./navigation";

/** signin: no cid for this branch yet · register: LINE known, no customer (only L-01 opens) · ready: registered customer */
export type LiffState = "signin" | "register" | "ready";

/** 403 view (suspended shop); the text is the API's FORBIDDEN message */
export function LiffForbidden() {
  return (
    <section role="alert" className="flex flex-col items-center gap-2 px-4 py-16 text-center">
      <p className="text-4xl font-semibold text-muted-foreground">403</p>
      <p>{ERROR_MESSAGE_TH.FORBIDDEN}</p>
    </section>
  );
}

function LoadingView({ label }: { label: string }) {
  return (
    <div className="grid gap-3 p-4" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

/** Runs liff.init → getIDToken → liff.session once, then reloads the server guard (router.refresh). */
export function LiffSignIn({ branchSlug, liffId, fake }: { branchSlug: string; liffId: string | null; fake: boolean }) {
  const t = useTranslations("shell-liff");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!liffId && !fake) return;
    let cancelled = false;
    liffSignIn({ branchSlug, liffId: liffId ?? "", fake, href: window.location.href })
      .then((session) => {
        if (session && !cancelled) router.refresh();
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [branchSlug, liffId, fake, router, attempt]);

  if (!liffId && !fake)
    return (
      <p role="alert" className="p-4 text-center">
        {ERROR_MESSAGE_TH.LINE_NOT_CONNECTED}
      </p>
    );
  if (error)
    return (
      <div role="alert" className="grid justify-items-center gap-3 p-4 text-center">
        <p>{error}</p>
        <Button
          type="button"
          onClick={() => {
            setError(null);
            setAttempt((n) => n + 1);
          }}
        >
          {t("retry")}
        </Button>
      </div>
    );
  return <LoadingView label={t("signingIn")} />;
}

export function LiffShell({
  branchSlug,
  shop,
  state,
  fake,
  children,
}: {
  branchSlug: string;
  shop: PublicBranchResponse;
  state: LiffState;
  fake: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("shell-liff");
  const pathname = usePathname();
  const router = useRouter();
  const register = routeFor("L-01", branchSlug);
  const onRegister = pathname === register;
  useEffect(() => {
    if (state === "register" && !onRegister) router.replace(register);
  }, [state, onRegister, register, router]);

  const body =
    state === "signin" ? (
      <LiffSignIn branchSlug={branchSlug} liffId={shop.liffId} fake={fake} />
    ) : state === "register" && !onRegister ? (
      <LoadingView label={t("signingIn")} />
    ) : (
      children
    );
  return (
    <div className="mx-auto min-h-dvh min-w-[360px] max-w-xl bg-background text-foreground">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        {shop.logoUrl ? (
          // biome-ignore lint/performance/noImgElement: signed storage URL, not a static asset
          <img src={shop.logoUrl} alt="" width={40} height={40} className="size-10 rounded-full object-cover" />
        ) : null}
        <p className="font-semibold">{shop.name}</p>
      </header>
      {state === "ready" ? (
        <nav aria-label={t("menu")} className="flex gap-2 overflow-x-auto border-b px-2 py-2">
          {menuItems(branchSlug, shop.modules).map(({ id, href }) =>
            href ? (
              <Link key={id} href={href} className="flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm">
                {t(id)}
              </Link>
            ) : (
              <button key={id} type="button" disabled className="min-h-11 shrink-0 rounded-lg px-3 text-sm opacity-50">
                {t(id)}
              </button>
            ),
          )}
        </nav>
      ) : null}
      <main className="min-w-0">{body}</main>
    </div>
  );
}
