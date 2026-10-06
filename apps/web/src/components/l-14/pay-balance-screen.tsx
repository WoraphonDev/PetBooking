"use client";

import type { PaymentInstruction } from "@app/contracts/dto/payment-instruction";
import { LiffPayPageResponse } from "@app/contracts/endpoints/liff.payPage";
import { LiffPayUploadSlipResponse } from "@app/contracts/endpoints/liff.payUploadSlip";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ApiClientError, errorMessage } from "@/lib/api";
import { formatTHB } from "@/lib/format";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { PromptPayQR, SlipUploader, type UploadedSlip } from "../shared/pay";
import { customerTicket } from "../shared/upload";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

export function BalanceView({ payment, branchSlug, billId }: { payment: PaymentInstruction; branchSlug: string; billId: string }) {
  const t = useTranslations("L-14");
  const [slip, setSlip] = useState<UploadedSlip | null>(null);
  const [sent, setSent] = useState(false);
  const send = useApiMutation("liff.payUploadSlip", { response: LiffPayUploadSlipResponse, invalidate: ["liff.payPage"] });
  // 06 L-14: ส่งสลิป while the bill is open (liff.payPage answers BILL_NOT_OPEN otherwise) and something is due
  const due = payment.amountSatang > 0;
  return (
    <div className="grid gap-6">
      <section className="grid justify-items-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">{t("balance")}</p>
        <p className="text-4xl font-bold tabular-nums">{formatTHB({ satang: payment.amountSatang })}</p>
        <PromptPayQR payload={payment.promptpayPayload} label={t("qr")} size={240} />
        <p>
          {t("accountName")}: <span className="font-semibold">{payment.accountName ?? "–"}</span>
        </p>
      </section>

      {!due ? (
        <p className="text-center text-muted-foreground">{t("nothingDue")}</p>
      ) : sent ? (
        <p role="status" className="rounded-lg bg-muted p-4 text-center">
          {t("waiting")}
        </p>
      ) : (
        <section className="grid gap-3">
          <h2 className="font-semibold">{t("sectionSlip")}</h2>
          <p className="text-sm text-muted-foreground">{t("slip")}</p>
          <SlipUploader
            requestTicket={customerTicket(branchSlug)}
            labels={{ pick: t("pickSlip"), uploading: t("uploading") }}
            onUploaded={setSlip}
          />
          <Button
            type="button"
            className="h-11"
            disabled={!slip || send.isPending}
            onClick={async () => {
              if (!slip || send.isPending) return;
              try {
                await send.mutateAsync({
                  params: { branchSlug, billId },
                  body: { fileId: slip.fileId, ...(slip.qrPayload ? { qrPayload: slip.qrPayload } : {}) },
                });
                setSent(true);
              } catch (error) {
                toast.error(errorMessage(error));
              }
            }}
          >
            {t("sendSlip")}
          </Button>
        </section>
      )}
    </div>
  );
}

export function PayBalanceScreen({ branchSlug, billId }: { branchSlug: string; billId: string }) {
  const t = useTranslations("L-14");
  const page = useApiQuery("liff.payPage", { params: { branchSlug, billId }, response: LiffPayPageResponse });
  return (
    <div className="grid gap-4 p-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      {page.isPending ? (
        <div className="grid justify-items-center gap-3" aria-busy="true">
          <span className="sr-only">{t("loading")}</span>
          <Skeleton className="h-10 w-40" />
          <Skeleton className="size-60" />
        </div>
      ) : page.isError ? (
        // a paid / void bill answers BILL_NOT_OPEN: nothing left to pay here
        page.error instanceof ApiClientError && page.error.code === "BILL_NOT_OPEN" ? (
          <p className="text-center text-muted-foreground">{t("nothingDue")}</p>
        ) : (
          <div role="alert" className="grid justify-items-start gap-2">
            <p>{errorMessage(page.error)}</p>
            <Button type="button" variant="outline" onClick={() => page.refetch()}>
              {t("retry")}
            </Button>
          </div>
        )
      ) : (
        <BalanceView payment={page.data} branchSlug={branchSlug} billId={billId} />
      )}
    </div>
  );
}
