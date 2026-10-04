"use client";
import { ReportsSalesQuery, ReportsSalesResponse } from "@app/contracts/endpoints/reports.sales";
import { Download } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTimeZone, useTranslations } from "next-intl";
import { buildUrl, errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { formatTHB, formatThaiDate } from "../../lib/format";
import { useApiQuery } from "../../lib/query";
import { BarChart } from "../shared/chart";
import { ThaiDatePicker } from "../shared/form";
import { DataTable, type DataTableColumn } from "../shared/table";
import { Button } from "../ui/button";
import { localToday, PRESETS, presetRange } from "./date-presets";

type Report = ReportsSalesResponse;
type Row = Report["rows"][number];
type Payment = Report["payments"][number];
type GroupBy = ReportsSalesQuery["groupBy"];
const GROUPS: GroupBy[] = ["day", "service", "groomer", "method"];

export function SalesReportScreen() {
  const t = useTranslations("C-23");
  const timezone = useTimeZone() ?? "Asia/Bangkok";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const from = params.get("from") || undefined;
  const to = params.get("to") || undefined;
  const groupParam = params.get("groupBy");
  const groupBy: GroupBy = GROUPS.includes(groupParam as GroupBy) ? (groupParam as GroupBy) : "day";
  const range = ReportsSalesQuery.safeParse({ from, to, groupBy });
  const query = useApiQuery(
    "reports.sales",
    { query: range.success ? range.data : undefined, response: ReportsSalesResponse },
    { enabled: range.success },
  );

  const update = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(values)) v ? next.set(k, v) : next.delete(k);
    router.replace(next.size ? `${pathname}?${next}` : pathname);
  };
  const validFrom = ReportsSalesQuery.shape.from.safeParse(from);
  const validTo = ReportsSalesQuery.shape.to.safeParse(to);

  const keyLabel = (row: Row): string => {
    if (row.key === null) return t("noGroomer");
    if (groupBy === "day") return formatThaiDate({ date: row.key });
    if (groupBy === "method") return enumLabel("payment_method", row.key as never);
    return row.key;
  };
  const money = (satang: number) => formatTHB({ satang });
  const columns: DataTableColumn<Row>[] = [
    { id: "key", header: t(`group_${groupBy}`), cell: keyLabel },
    { id: "billCount", header: t("billCount"), cell: (row) => row.billCount.toLocaleString("th-TH") },
    { id: "gross", header: t("gross"), cell: (row) => money(row.grossSatang) },
    { id: "discount", header: t("discount"), cell: (row) => money(row.discountSatang) },
    { id: "net", header: t("net"), cell: (row) => <strong>{money(row.netSatang)}</strong> },
  ];
  const paymentColumns: DataTableColumn<Payment>[] = [
    { id: "method", header: t("method"), cell: (p) => enumLabel("payment_method", p.method) },
    { id: "amount", header: t("amount"), cell: (p) => money(p.amountSatang) },
  ];
  const report = range.success ? query.data : undefined;
  const loading = range.success && query.isPending;
  const error = !range.success ? t("invalidFilter") : query.isError ? errorMessage(query.error) : null;
  const today = localToday(new Date(), timezone);

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        {range.success ? (
          <div className="flex flex-wrap gap-2">
            {(["bills", "bill_lines"] as const).map((type) => (
              <Button key={type} asChild variant="outline" className="h-11">
                <a href={buildUrl("exports.csv", { type }, { from: range.data.from, to: range.data.to })} download={`${type}.csv`}>
                  <Download aria-hidden />
                  {t("export")} {t(type === "bills" ? "exportBills" : "exportLines")}
                </a>
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4">
        <fieldset className="grid max-w-xl gap-2">
          <legend className="text-sm font-medium">{t("dateRange")}</legend>
          <div className="grid grid-cols-2 gap-2">
            <ThaiDatePicker
              value={validFrom.success ? validFrom.data : null}
              max={validTo.success ? validTo.data : undefined}
              placeholder={t("from")}
              onValueChange={(v) => update({ from: v })}
            />
            <ThaiDatePicker
              value={validTo.success ? validTo.data : null}
              min={validFrom.success ? validFrom.data : undefined}
              placeholder={t("to")}
              onValueChange={(v) => update({ to: v })}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button key={preset} type="button" variant="ghost" className="h-11" onClick={() => update(presetRange(preset, today))}>
                {t(`preset_${preset}`)}
              </Button>
            ))}
          </div>
        </fieldset>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">{t("groupBy")}</legend>
          <div role="radiogroup" aria-label={t("groupBy")} className="inline-flex w-fit flex-wrap gap-1 rounded-lg border p-1">
            {GROUPS.map((g) => (
              <Button
                key={g}
                type="button"
                role="radio"
                aria-checked={g === groupBy}
                variant={g === groupBy ? "default" : "ghost"}
                className="h-11"
                onClick={() => update({ groupBy: g === "day" ? null : g })}
              >
                {t(`group_${g}`)}
              </Button>
            ))}
          </div>
        </fieldset>
      </div>

      {from && to ? (
        <div className="grid gap-6">
          <section className="grid gap-3" aria-labelledby="sales-totals-heading">
            <h2 id="sales-totals-heading" className="font-medium">
              {t("totals")}
            </h2>
            <dl className="grid gap-3 sm:grid-cols-3">
              {(["gross", "discount", "net"] as const).map((k) => (
                <div key={k} className="rounded-lg border p-4">
                  <dt className="text-sm text-muted-foreground">{t(k)}</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{report ? money(report.totals[`${k}Satang`]) : "—"}</dd>
                </div>
              ))}
            </dl>
          </section>
          {groupBy === "day" ? (
            <section className="grid min-w-0 gap-3" aria-labelledby="sales-chart-heading">
              <h2 id="sales-chart-heading" className="font-medium">
                {t("chart")}
              </h2>
              {report ? (
                <BarChart
                  label={t("chart")}
                  unit="money"
                  data={report.rows.map((row) => ({ label: keyLabel(row), value: row.netSatang }))}
                />
              ) : null}
            </section>
          ) : null}
          <section className="grid gap-3" aria-labelledby="sales-table-heading">
            <h2 id="sales-table-heading" className="font-medium">
              {t("table")}
            </h2>
            <DataTable
              columns={columns}
              rows={report?.rows}
              rowKey={(row) => row.key ?? "none"}
              isLoading={loading}
              error={error}
              onRetry={() => query.refetch()}
            />
          </section>
          <section className="grid gap-3" aria-labelledby="sales-payments-heading">
            <h2 id="sales-payments-heading" className="font-medium">
              {t("payments")}
            </h2>
            <DataTable
              columns={paymentColumns}
              rows={report?.payments}
              rowKey={(p) => p.method}
              isLoading={loading}
              error={error}
              onRetry={() => query.refetch()}
            />
          </section>
        </div>
      ) : (
        <p className="text-muted-foreground">{t("pickRange")}</p>
      )}
    </section>
  );
}
