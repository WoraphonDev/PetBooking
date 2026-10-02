"use client";

import { AdminAnalyticsResponse } from "@app/contracts/endpoints/admin.analytics";
import { AdminOrgsResponse } from "@app/contracts/endpoints/admin.orgs";
import { toLocalDate } from "@app/domain/time/local-time";
import { useNow, useTranslations } from "next-intl";
import { errorMessage } from "@/lib/api";
import { formatThaiDate } from "@/lib/format";
import { useApiQuery } from "@/lib/query";
import { DataTable, type DataTableColumn } from "../shared/table";

type Row = AdminAnalyticsResponse["orgs"][number];

/** Q-0046: 06 has no date inputs — the screen asks for the 7 Bangkok days ending today (from/to inclusive). */
export function pilotRange(now: Date): { from: string; to: string } {
  const to = toLocalDate({ instant: now.toISOString(), timezone: "Asia/Bangkok" });
  const [y, m, d] = to.split("-").map(Number) as [number, number, number];
  const from = new Date(Date.UTC(y, m - 1, d - 6)).toISOString().slice(0, 10);
  return { from, to };
}

export function AnalyticsScreen() {
  const t = useTranslations("AD-06");
  const now = useNow();
  const range = pilotRange(now);
  const analytics = useApiQuery<AdminAnalyticsResponse>(
    "admin.analytics",
    { query: range, response: AdminAnalyticsResponse },
    { meta: { toast: false } },
  );
  // Q-0046: PilotAnalytics has orgId only; names come from the admin.orgs list
  const orgs = useApiQuery<AdminOrgsResponse>("admin.orgs", { response: AdminOrgsResponse }, { meta: { toast: false } });
  const nameOf = new Map((orgs.data ?? []).map((o) => [o.id, o.name]));
  const columns: DataTableColumn<Row>[] = [
    { id: "shop", header: t("shop"), cell: (row) => nameOf.get(row.orgId) ?? t("unavailable") },
    { id: "activeDays7", header: t("activeDays7"), cell: (row) => row.activeDays7, className: "text-right tabular-nums" },
    { id: "onlineShare", header: t("onlineShare"), cell: (row) => `${row.onlineShare}%`, className: "text-right tabular-nums" },
    { id: "noShowRate", header: t("noShowRate"), cell: (row) => `${row.noShowRate}%`, className: "text-right tabular-nums" },
    { id: "pushUsed", header: t("pushUsed"), cell: (row) => row.pushUsed, className: "text-right tabular-nums" },
    { id: "billsClosed", header: t("billsClosed"), cell: (row) => row.billsClosed, className: "text-right tabular-nums" },
  ];
  const error = analytics.error ?? orgs.error;
  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("range", { from: formatThaiDate({ date: range.from }), to: formatThaiDate({ date: range.to }) })}
        </p>
      </div>
      <DataTable
        columns={columns}
        rows={analytics.data?.orgs}
        rowKey={(row) => row.orgId}
        isLoading={analytics.isPending || orgs.isPending}
        error={error ? errorMessage(error) : null}
        onRetry={() => {
          if (analytics.error) void analytics.refetch();
          if (orgs.error) void orgs.refetch();
        }}
      />
    </main>
  );
}
