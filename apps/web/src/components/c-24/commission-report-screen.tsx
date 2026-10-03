"use client";
import { ReportsCommissionsQuery, ReportsCommissionsResponse } from "@app/contracts/endpoints/reports.commissions";
import { Download } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { buildUrl, errorMessage } from "../../lib/api";
import { formatTHB } from "../../lib/format";
import { useApiQuery } from "../../lib/query";
import { ThaiDatePicker } from "../shared/form";
import { DataTable, type DataTableColumn } from "../shared/table";
import { Button } from "../ui/button";

type Row = ReportsCommissionsResponse["rows"][number];

export function CommissionReportScreen() {
  const t = useTranslations("C-24");
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
      // Q-0077: CommissionReport carries entry ids only — date/receipt/service/base/rule/amount need a detail source
      cell: (row) => (
        <details>
          <summary className="min-h-11 cursor-pointer content-center">{t("entries", { count: row.entries.length })}</summary>
          <ul className="grid gap-1 font-mono text-xs">
            {row.entries.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
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
