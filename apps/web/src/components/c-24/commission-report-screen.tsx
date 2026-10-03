"use client";
import { ReportsCommissionsQuery, ReportsCommissionsResponse } from "@app/contracts/endpoints/reports.commissions";
import { Download } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTimeZone, useTranslations } from "next-intl";
import { buildUrl, errorMessage } from "../../lib/api";
import { formatTHB, formatThaiDate } from "../../lib/format";
import { useApiQuery } from "../../lib/query";
import { ThaiDatePicker } from "../shared/form";
import { DataTable, type DataTableColumn } from "../shared/table";
import { Button } from "../ui/button";

type Row = ReportsCommissionsResponse["rows"][number];

export function CommissionReportScreen() {
  const t = useTranslations("C-24");
  const timezone = useTimeZone() ?? "Asia/Bangkok";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const from = params.get("from") || undefined;
  const to = params.get("to") || undefined;
  const range = ReportsCommissionsQuery.safeParse({ from, to });
  const query = useApiQuery(
    "reports.commissions",
    { query: range.success ? range.data : undefined, response: ReportsCommissionsResponse },
    { enabled: range.success },
  );
  const setDate = (key: "from" | "to", value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(next.size ? `${pathname}?${next}` : pathname);
  };
  const columns: DataTableColumn<Row>[] = [
    { id: "staff", header: t("staff"), cell: (row) => row.staffName },
    { id: "jobs", header: t("jobs"), cell: (row) => row.jobs.toLocaleString("th-TH") },
    { id: "base", header: t("base"), cell: (row) => formatTHB({ satang: row.baseSatang }) },
    { id: "amount", header: t("amount"), cell: (row) => <strong>{formatTHB({ satang: row.amountSatang })}</strong> },
    {
      id: "details",
      header: t("details"),
      // 06: expand → วันที่, ใบเสร็จ, บริการ, ฐาน, กติกา, ยอด per counted event (Q-0077; a reversal counts negative)
      cell: (row) => (
        <details>
          <summary className="min-h-11 cursor-pointer content-center">{t("entries", { count: row.entries.length })}</summary>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr>
                {(["entryDate", "entryReceipt", "entryService", "entryBase", "entryRule", "entryAmount"] as const).map((key) => (
                  <th key={key} className="text-left font-medium">
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {row.entries.map((e) => (
                <tr key={`${e.id}:${e.sign}`}>
                  <td>{formatThaiDate({ date: new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(e.at)) })}</td>
                  <td className="font-mono">{e.receiptNo ?? "—"}</td>
                  <td>
                    {e.serviceName}
                    {e.sign < 0 ? <span className="text-destructive"> · {t("reversed")}</span> : null}
                  </td>
                  <td>{formatTHB({ satang: e.sign * e.baseSatang })}</td>
                  <td>{e.ruleLabel ?? "—"}</td>
                  <td>{formatTHB({ satang: e.sign * e.amountSatang })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ),
    },
  ];
  const hasRange = Boolean(from && to);
  return (
    <section className="grid gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        {range.success ? (
          <Button asChild variant="outline" className="h-11">
            <a href={buildUrl("exports.csv", { type: "commissions" }, range.data)} download="commissions.csv">
              <Download aria-hidden />
              {t("export")}
            </a>
          </Button>
        ) : null}
      </div>
      <fieldset className="grid max-w-xl gap-2">
        <legend className="text-sm font-medium">{t("dateRange")}</legend>
        <div className="grid grid-cols-2 gap-2">
          <ThaiDatePicker value={from ?? null} max={to} placeholder={t("from")} onValueChange={(v) => setDate("from", v)} />
          <ThaiDatePicker value={to ?? null} min={from} placeholder={t("to")} onValueChange={(v) => setDate("to", v)} />
        </div>
      </fieldset>
      {hasRange ? (
        <DataTable
          columns={columns}
          rows={query.data?.rows}
          rowKey={(row) => row.staffUserId}
          isLoading={range.success && query.isPending}
          error={!range.success ? t("invalidFilter") : query.isError ? errorMessage(query.error) : null}
          onRetry={() => query.refetch()}
        />
      ) : (
        <p className="text-muted-foreground">{t("pickRange")}</p>
      )}
    </section>
  );
}
