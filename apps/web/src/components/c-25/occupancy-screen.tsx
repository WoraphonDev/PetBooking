"use client";

import { ReportsOccupancyQuery, ReportsOccupancyResponse } from "@app/contracts/endpoints/reports.occupancy";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { errorMessage } from "../../lib/api";
import { useApiQuery } from "../../lib/query";
import { ThaiDatePicker } from "../shared/form";
import { DataTable, type DataTableColumn } from "../shared/table";
import { OccupancyChart } from "./occupancy-chart";

type Row = ReportsOccupancyResponse["byRoomType"][number];

export function OccupancyScreen() {
  const t = useTranslations("C-25");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const from = params.get("from") || undefined;
  const to = params.get("to") || undefined;
  const range = ReportsOccupancyQuery.safeParse({ from, to });
  const query = useApiQuery(
    "reports.occupancy",
    { query: range.success ? range.data : undefined, response: ReportsOccupancyResponse },
    { enabled: range.success },
  );
  const setDate = (key: "from" | "to", value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(next.size ? `${pathname}?${next}` : pathname);
  };
  // Malformed URL dates must not reach the calendar or R-31 formatter.
  const validFrom = ReportsOccupancyQuery.shape.from.safeParse(from);
  const validTo = ReportsOccupancyQuery.shape.to.safeParse(to);
  const columns: DataTableColumn<Row>[] = [
    { id: "roomType", header: t("roomType"), cell: (row) => row.roomTypeName },
    { id: "occupiedNights", header: t("occupiedNights"), cell: (row) => row.occupiedNights.toLocaleString("th-TH") },
    { id: "totalNights", header: t("totalNights"), cell: (row) => row.totalNights.toLocaleString("th-TH") },
    { id: "percent", header: t("percent"), cell: (row) => `${row.percent}%` },
  ];
  return (
    <section className="grid gap-6">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <fieldset className="grid max-w-xl gap-2">
        <legend className="text-sm font-medium">{t("dateRange")}</legend>
        <div className="grid grid-cols-2 gap-2">
          <ThaiDatePicker
            value={validFrom.success ? validFrom.data : null}
            max={validTo.success ? validTo.data : undefined}
            placeholder={t("from")}
            onValueChange={(v) => setDate("from", v)}
          />
          <ThaiDatePicker
            value={validTo.success ? validTo.data : null}
            min={validFrom.success ? validFrom.data : undefined}
            placeholder={t("to")}
            onValueChange={(v) => setDate("to", v)}
          />
        </div>
      </fieldset>
      {from && to ? (
        <div className="grid gap-6">
          <section className="grid min-w-0 gap-3" aria-labelledby="occupancy-chart-heading">
            <h2 id="occupancy-chart-heading" className="font-medium">
              {t("chart")}
            </h2>
            {range.success && !query.isPending && !query.isError && query.data ? (
              <OccupancyChart days={query.data.days} label={t("chart")} />
            ) : null}
          </section>
          <section className="grid gap-3" aria-labelledby="occupancy-room-types-heading">
            <h2 id="occupancy-room-types-heading" className="font-medium">
              {t("byRoomType")}
            </h2>
            <DataTable
              columns={columns}
              rows={range.success ? query.data?.byRoomType : undefined}
              rowKey={(row) => row.roomTypeId}
              isLoading={range.success && query.isPending}
              error={!range.success ? t("invalidFilter") : query.isError ? errorMessage(query.error) : null}
              onRetry={range.success && query.isError ? () => query.refetch() : undefined}
            />
          </section>
        </div>
      ) : (
        <p className="text-muted-foreground">{t("pickRange")}</p>
      )}
    </section>
  );
}
