"use client";

import { BillsReceiptResponse } from "@app/contracts/endpoints/bills.receipt";
import { toLocalDate } from "@app/domain/time/local-time";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { enumLabel } from "@/lib/enum-label";
import { formatTHB, formatThaiDate, formatTime } from "@/lib/format";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

// Receipt has no branch timezone; MVP shops are in Thailand (01 RequestContext default)
const TIMEZONE = "Asia/Bangkok";
export const PAPER_SIZES = { "58": "58mm auto", "80": "80mm auto", A5: "A5" } as const;
export type PaperSize = keyof typeof PAPER_SIZES;
const PAPER_KEY = "c20.paper";
const PAPER_LABEL = { "58": "paper58", "80": "paper80", A5: "paperA5" } as const;

/** Q-0052: the remembered paper size (per browser), 80 mm by default */
export function readPaperSize(): PaperSize {
  try {
    const saved = globalThis.localStorage?.getItem(PAPER_KEY);
    return saved && saved in PAPER_SIZES ? (saved as PaperSize) : "80";
  } catch {
    return "80";
  }
}
function savePaperSize(size: PaperSize) {
  try {
    globalThis.localStorage?.setItem(PAPER_KEY, size);
  } catch {
    // private mode: the choice just isn't remembered
  }
}

/** print only the receipt, on the chosen paper (06 C-20: window.print() + @page 58mm/80mm/A5) */
export function printCss(size: PaperSize): string {
  return `@page { size: ${PAPER_SIZES[size]}; margin: 4mm; }
@media print {
  body * { visibility: hidden; }
  [data-slot="receipt"], [data-slot="receipt"] * { visibility: visible; }
  [data-slot="receipt"] { position: absolute; inset: 0 auto auto 0; width: 100%; max-width: none; border: 0; }
}`;
}

export function ReceiptScreen({ billId }: { billId: string }) {
  const t = useTranslations("C-20");
  const common = useTranslations("common");
  const [paper, setPaper] = useState<PaperSize>("80");
  useEffect(() => setPaper(readPaperSize()), []);
  const query = useApiQuery<BillsReceiptResponse>(
    "bills.receipt",
    { params: { billId }, response: BillsReceiptResponse },
    { meta: { toast: false } },
  );
  const send = useApiMutation("bills.sendReceipt", { onSuccess: () => toast.success(t("sent")) });
  const receipt = query.data;
  const money = (satang: number) => formatTHB({ satang, decimals: "always" });

  if (query.isPending) return <Skeleton aria-busy="true" className="mx-auto h-96 w-full max-w-sm" />;
  if (query.error || !receipt)
    return (
      <div role="alert" className="flex flex-col items-start gap-2 text-sm text-destructive">
        <p>{query.error ? errorMessage(query.error) : null}</p>
        <Button type="button" variant="outline" className="h-11" onClick={() => void query.refetch()}>
          {common("retry")}
        </Button>
      </div>
    );

  const voided = receipt.status === "void";
  return (
    <div className="flex flex-col items-center gap-4">
      <style>{printCss(paper)}</style>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <label className="flex items-center gap-2 text-sm">
          {t("paperSize")}
          <select
            className="h-11 rounded-lg border bg-background px-2"
            value={paper}
            onChange={(e) => {
              const size = e.target.value as PaperSize;
              setPaper(size);
              savePaperSize(size);
            }}
          >
            {(Object.keys(PAPER_SIZES) as PaperSize[]).map((size) => (
              <option key={size} value={size}>
                {t(PAPER_LABEL[size])}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" className="h-11" onClick={() => window.print()}>
          {t("print")}
        </Button>
        {/* Q-0052: Receipt has no LINE flag — shown for a paid bill with a customer; the dispatcher skips customers without LINE */}
        {receipt.customerName !== null && receipt.status === "paid" ? (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={send.isPending}
            onClick={() => send.mutate({ params: { billId } })}
          >
            {t("sendLine")}
          </Button>
        ) : null}
      </div>

      <article data-slot="receipt" className="relative w-full max-w-sm rounded-lg border bg-white p-4 font-mono text-sm text-black">
        {voided ? (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="-rotate-30 text-6xl font-bold text-red-600/30">{t("void")}</span>
          </div>
        ) : null}
        <header className="flex flex-col items-center gap-1 border-b border-dashed pb-3 text-center">
          {receipt.logoUrl ? (
            // biome-ignore lint/performance/noImgElement: signed storage URL, not a Next static asset
            <img src={receipt.logoUrl} alt={receipt.shopName} className="h-12 w-auto" />
          ) : null}
          <p className="text-base font-bold">{receipt.shopName}</p>
          {receipt.shopAddress ? <p>{receipt.shopAddress}</p> : null}
          {receipt.shopPhone ? <p>{receipt.shopPhone}</p> : null}
          <p className="mt-2 font-semibold">{t("title")}</p>
        </header>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 border-b border-dashed py-2">
          <dt>{t("receiptNo")}</dt>
          <dd className="text-right">{receipt.receiptNo ?? t("unavailable")}</dd>
          <dt>{t("date")}</dt>
          <dd className="text-right">
            {receipt.closedAt
              ? `${formatThaiDate({ date: toLocalDate({ instant: receipt.closedAt, timezone: TIMEZONE }) })} ${formatTime({ instant: receipt.closedAt, timezone: TIMEZONE })}`
              : t("unavailable")}
          </dd>
          <dt>{t("customer")}</dt>
          <dd className="text-right">{receipt.customerName ?? t("unavailable")}</dd>
        </dl>

        <section aria-label={t("items")} className="border-b border-dashed py-2">
          <p className="font-semibold">{t("items")}</p>
          <ul className="flex flex-col gap-1">
            {receipt.lines.map((line, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: receipt lines have no id in the Receipt DTO
              <li key={i}>
                <p>{line.description}</p>
                <p className="flex justify-between">
                  <span>
                    {line.quantity} × {money(line.unitPriceSatang)}
                  </span>
                  <span>{money(line.lineTotalSatang)}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 border-b border-dashed py-2">
          <dt>{t("discount")}</dt>
          <dd className="text-right">{money(receipt.billDiscountSatang)}</dd>
          <dt className="font-bold">{t("total")}</dt>
          <dd className="text-right text-base font-bold">{money(receipt.totalSatang)}</dd>
          <dt className="col-span-2">{t("paidBy")}</dt>
          {receipt.payments.map((p, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: payments have no id in the Receipt DTO
            <div key={i} className="contents">
              <dd className="pl-2">{enumLabel("payment_method", p.method)}</dd>
              <dd className="text-right">{money(p.amountSatang)}</dd>
            </div>
          ))}
          <dt>{t("change")}</dt>
          <dd className="text-right">{money(receipt.changeSatang)}</dd>
        </dl>

        {receipt.packagesRemaining.length ? (
          <section aria-label={t("packagesRemaining")} className="border-b border-dashed py-2">
            <p className="font-semibold">{t("packagesRemaining")}</p>
            {receipt.packagesRemaining.map((p) => (
              <p key={p.id}>
                {t("packageLine", {
                  name: p.templateName,
                  left: String(p.sessionsLeft),
                  expires: formatThaiDate({ date: toLocalDate({ instant: p.expiresAt, timezone: TIMEZONE }) }),
                })}
              </p>
            ))}
          </section>
        ) : null}

        <p className="pt-2">
          {t("cashier")}: {receipt.cashierName ?? t("unavailable")}
        </p>
      </article>
    </div>
  );
}
