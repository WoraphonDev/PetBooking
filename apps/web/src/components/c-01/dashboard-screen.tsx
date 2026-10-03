"use client";
import { AuthMeResponse } from "@app/contracts/endpoints/auth.me";
import { DashboardTodayResponse } from "@app/contracts/endpoints/dashboard.today";
import type { GroomStatus } from "@app/contracts/enums";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { errorMessage } from "../../lib/api";
import { formatTHB } from "../../lib/format";
import { useApiQuery } from "../../lib/query";
import { StatusBadge } from "../shared/table";
import { TONE_CLASS } from "../shared/table/status-tones";
import { Button } from "../ui/button";

const links = {
  pendingSlips: "/console/slips",
  pendingApprovals: "/console/bookings?tab=approval",
  overdueCareTasks: "/console/hotel/tasks",
  reportCardsToReview: "/console/report-cards",
  unsentMessages: "/console/messages",
  pickupsWithoutBill: "/console/bills",
  linkRequests: "/console/link-requests",
} as const;
export function watchDashboardPush(
  refetch: () => unknown,
  worker: EventTarget | null = typeof navigator !== "undefined" ? (navigator.serviceWorker ?? null) : null,
) {
  const listener = (event: Event) => {
    if ((event as MessageEvent).data?.type === "dashboard-refresh") void refetch();
  };
  worker?.addEventListener("message", listener);
  return () => worker?.removeEventListener("message", listener);
}
export function DashboardScreen() {
  const t = useTranslations("C-01");
  const common = useTranslations("common");
  const me = useApiQuery("auth.me", { response: AuthMeResponse });
  const query = useApiQuery("dashboard.today", { response: DashboardTodayResponse }, { refetchInterval: 60_000 });
  useEffect(() => watchDashboardPush(query.refetch), [query.refetch]);
  const data = query.data;
  return (
    <section className="grid gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <Link className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-primary-foreground" href="/console/bookings/new">
          {t("add")}
        </Link>
      </div>
      {query.isError ? (
        <div role="alert">
          {errorMessage(query.error)} <Button onClick={() => query.refetch()}>{common("retry")}</Button>
        </div>
      ) : query.isPending ? (
        <div role="status" aria-busy="true" aria-label={common("loading")} className="h-48 animate-pulse rounded-md bg-muted" />
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-md border p-4">
              <h2>{t("groom")}</h2>
              <p className="text-2xl font-semibold">{data.groom.total}</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.groom.byStatus).map(([status, count]) => (
                  <span key={status}>
                    <StatusBadge enumName="groom_status" value={status as GroomStatus} /> {count}
                  </span>
                ))}
              </div>
            </article>
            {(["arrivals", "departures", "inHouse", "occupancy"] as const).map((key) => (
              <article key={key} className="rounded-md border p-4">
                <h2>{t(key)}</h2>
                <p className="text-2xl font-semibold">{key === "occupancy" ? `${data.hotel.occupancyPercent}%` : data.hotel[key]}</p>
              </article>
            ))}
            <article className="rounded-md border p-4">
              <h2>{t("daycare")}</h2>
              <p className="text-2xl font-semibold">{data.daycare.count}</p>
            </article>
            {me.data?.staff.role === "owner" && data.sales ? (
              <article className="rounded-md border p-4">
                <h2>{t("sales")}</h2>
                <p className="text-2xl font-semibold">{formatTHB({ satang: data.sales.paidTotalSatang })}</p>
              </article>
            ) : null}
          </div>
          <div className="grid gap-3">
            <h2 className="text-lg font-semibold">{t("todo")}</h2>
            {Object.entries(links).map(([key, href]) => {
              const todoKey = key as keyof typeof links;
              const count = data.todo[todoKey];
              return (
                <Link key={key} href={href} className="flex min-h-11 items-center justify-between rounded-md border px-4">
                  <span>{t(todoKey)}</span>
                  <span
                    data-tone={key === "pendingSlips" && count > 0 ? "danger" : "neutral"}
                    className={`rounded-full px-2.5 py-0.5 ${key === "pendingSlips" && count > 0 ? TONE_CLASS.danger : TONE_CLASS.neutral}`}
                  >
                    {count}
                  </span>
                </Link>
              );
            })}
          </div>
        </>
      ) : (
        <p>{common("empty")}</p>
      )}
    </section>
  );
}
