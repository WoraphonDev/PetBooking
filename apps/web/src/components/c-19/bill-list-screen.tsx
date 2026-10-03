"use client";
import type { BillListItem } from "@app/contracts/dto/bill-list-item";
import { BillsListQuery, BillsListResponse } from "@app/contracts/endpoints/bills.list";
import { BillsOpenResponse } from "@app/contracts/endpoints/bills.open";
import type { PaymentMethod } from "@app/contracts/enums";
import { Banknote, Coins, CreditCard, Landmark, QrCode, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTimeZone, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { formatTHB, formatTime } from "../../lib/format";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { DataTable, type DataTableColumn, StatusBadge, useCursorPagination } from "../shared/table";
import { Button } from "../ui/button";

const icons: Record<PaymentMethod, typeof Banknote> = {
  cash: Banknote,
  promptpay: QrCode,
  bank_transfer: Landmark,
  card_edc: CreditCard,
  deposit: Wallet,
  credit: Coins,
};
export function BillListScreen() {
  const t = useTranslations("C-19");
  const timezone = useTimeZone() ?? "Asia/Bangkok";
  const router = useRouter();
  const params = useSearchParams();
  const status = params.get("status") || undefined;
  const date = params.get("date") || undefined;
  const pagination = useCursorPagination();
  const reset = pagination.reset;
  const previousFilters = useRef({ status, date });
  useEffect(() => {
    if (previousFilters.current.status !== status || previousFilters.current.date !== date) {
      previousFilters.current = { status, date };
      reset();
    }
  }, [status, date, reset]);
  const filters = BillsListQuery.safeParse({ status, date, cursor: pagination.cursor ?? undefined });
  const query = useApiQuery(
    "bills.list",
    { query: filters.success ? filters.data : undefined, response: BillsListResponse },
    { enabled: filters.success },
  );
  const mutation = useApiMutation("bills.open", { response: BillsOpenResponse, invalidate: ["bills.list"], meta: { toast: false } });
  const [message, setMessage] = useState("");
  const columns: DataTableColumn<BillListItem>[] = [
    {
      id: "receipt",
      header: t("receipt"),
      cell: (row) => (
        <Link href={`/console/bills/${row.id}`} className="inline-flex min-h-11 items-center font-mono">
          {row.status === "open" ? "—" : (row.receiptNo ?? "—")}
        </Link>
      ),
    },
    { id: "customer", header: t("customer"), cell: (row) => row.customerName ?? "—" },
    { id: "total", header: t("total"), cell: (row) => formatTHB({ satang: row.totalSatang }) },
    { id: "paid", header: t("paid"), cell: (row) => formatTHB({ satang: row.paidSatang }) },
    {
      id: "methods",
      header: t("methods"),
      cell: (row) =>
        row.methods.length ? (
          <div className="flex gap-2">
            {row.methods.map((method) => {
              const Icon = icons[method];
              const label = enumLabel("payment_method", method);
              return (
                <span key={method} role="img" aria-label={label} title={label}>
                  <Icon className="size-5" aria-hidden />
                </span>
              );
            })}
          </div>
        ) : (
          "—"
        ),
    },
    { id: "status", header: t("status"), cell: (row) => <StatusBadge enumName="bill_status" value={row.status} /> },
    { id: "time", header: t("time"), cell: (row) => formatTime({ instant: row.closedAt ?? row.openedAt, timezone }) },
  ];
  return (
    <section className="grid gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <Button
          type="button"
          className="h-11"
          disabled={mutation.isPending}
          onClick={async () => {
            if (mutation.isPending) return;
            setMessage("");
            try {
              const bill = await mutation.mutateAsync({ body: {} });
              router.push(`/console/bills/${bill.id}`);
            } catch (error) {
              setMessage(errorMessage(error));
            }
          }}
        >
          {t("open")}
        </Button>
      </div>
      {message ? <p role="alert">{message}</p> : null}
      <DataTable
        columns={columns}
        rows={query.data?.items}
        rowKey={(row) => row.id}
        isLoading={query.isPending}
        error={!filters.success ? t("invalidFilter") : query.isError ? errorMessage(query.error) : null}
        onRetry={() => query.refetch()}
        pagination={{
          nextCursor: query.data?.nextCursor ?? null,
          hasPrevious: pagination.hasPrevious,
          onNext: pagination.next,
          onPrevious: pagination.previous,
        }}
      />
    </section>
  );
}
