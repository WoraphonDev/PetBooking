"use client";

import type { MyBookingDetail } from "@app/contracts/dto/my-booking-detail";
import { LiffBookingResponse } from "@app/contracts/endpoints/liff.booking";
import { LiffUploadSlipResponse } from "@app/contracts/endpoints/liff.uploadSlip";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNow, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ApiClientError, errorMessage } from "@/lib/api";
import { formatTHB } from "@/lib/format";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { Countdown, PromptPayQR, remainingMs, SlipUploader, type UploadedSlip } from "../shared/pay";
import { customerTicket } from "../shared/upload";
import { liffNavigation } from "../shell-liff/navigation";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

/** route of a LIFF screen with its ids filled in; `fallback` when that screen is not implemented yet (Q-1038) */
export function screenPath(id: "L-02" | "L-08" | "L-09", branchSlug: string, bookingId: string, fallback?: string): string {
  const entry = liffNavigation.find((e) => e.id === id);
  if (!entry?.implemented && fallback) return fallback;
  return (entry?.route ?? "").replace("[branchSlug]", encodeURIComponent(branchSlug)).replace("[bookingId]", encodeURIComponent(bookingId));
}

/** 06 L-07: slip upload only while awaiting_deposit and before hold_expires_at */
export function canSendSlip(detail: MyBookingDetail, now: number): boolean {
  const expiresAt = detail.payment?.expiresAt;
  return detail.booking.status === "awaiting_deposit" && !!detail.payment && (!expiresAt || remainingMs(expiresAt, now) > 0);
}

export function isExpired(detail: MyBookingDetail, now: number): boolean {
  const expiresAt = detail.payment?.expiresAt;
  return (
    detail.booking.status === "expired" ||
    (detail.booking.status === "awaiting_deposit" && !!expiresAt && remainingMs(expiresAt, now) === 0)
  );
}

/** "บันทึกรูป QR": the rendered QR as a PNG (photo albums and LINE's browser handle PNG, not SVG) */
export function downloadQr(container: HTMLElement | null, fileName: string, size = 720) {
  const svg = container?.querySelector("svg");
  if (!svg) return;
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    canvas.getContext("2d")?.drawImage(image, 0, 0, size, size);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = fileName;
    a.click();
  };
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
}

export function ExpiredView({ branchSlug }: { branchSlug: string }) {
  const t = useTranslations("L-07");
  return (
    <section role="alert" className="grid justify-items-center gap-3 p-6 text-center">
      <h2 className="text-lg font-semibold">{t("expiredTitle")}</h2>
      <p>{t("expiredBody")}</p>
      <Button asChild className="h-11">
        <Link href={screenPath("L-02", branchSlug, "")}>{t("bookAgain")}</Link>
      </Button>
    </section>
  );
}

export function PayView({ detail, branchSlug, bookingId }: { detail: MyBookingDetail; branchSlug: string; bookingId: string }) {
  const t = useTranslations("L-07");
  const router = useRouter();
  const now = useNow({ updateInterval: 1000 }).getTime();
  const [expired, setExpired] = useState(false);
  const [slip, setSlip] = useState<UploadedSlip | null>(null);
  const qrBox = useRef<HTMLDivElement>(null);
  const send = useApiMutation("liff.uploadSlip", { response: LiffUploadSlipResponse, invalidate: ["liff.booking", "liff.bookings"] });
  const payment = detail.payment;
  if (expired || isExpired(detail, now)) return <ExpiredView branchSlug={branchSlug} />;
  if (!payment || detail.booking.status !== "awaiting_deposit")
    return (
      <section className="grid justify-items-center gap-3 p-6 text-center">
        <p>{t("nothingDue")}</p>
        <Button asChild variant="outline" className="h-11">
          <Link href={screenPath("L-09", branchSlug, bookingId, screenPath("L-08", branchSlug, bookingId))}>{t("toBooking")}</Link>
        </Button>
      </section>
    );
  const allowed = canSendSlip(detail, now) && !expired;
  return (
    <div className="grid gap-6">
      <section className="grid justify-items-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">{t("amount")}</p>
        <p className="text-4xl font-bold tabular-nums">{formatTHB({ satang: payment.amountSatang })}</p>
        <div ref={qrBox}>
          <PromptPayQR payload={payment.promptpayPayload} label={t("qr")} size={240} />
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => downloadQr(qrBox.current, `promptpay-${detail.booking.bookingNo}.svg`)}
        >
          {t("saveQr")}
        </Button>
        <p>
          {t("accountName")}: <span className="font-semibold">{payment.accountName ?? "–"}</span>
          <span className="block text-sm text-muted-foreground">
            {t("checkName")} · …{payment.promptpayIdMasked}
          </span>
        </p>
        {payment.expiresAt ? (
          <p>
            {t("timeLeft")}{" "}
            <Countdown
              expiresAt={payment.expiresAt}
              expiredLabel={t("timeUp")}
              onExpire={() => setExpired(true)}
              className="font-semibold"
            />
          </p>
        ) : null}
      </section>

      <section className="grid gap-3">
        <h2 className="font-semibold">{t("sectionSlip")}</h2>
        <p className="text-sm text-muted-foreground">{t("slip")}</p>
        <SlipUploader
          requestTicket={customerTicket(branchSlug)}
          labels={{ pick: t("pickSlip"), uploading: t("uploading") }}
          onUploaded={setSlip}
          disabled={!allowed}
        />
        {allowed ? (
          <Button
            type="button"
            className="h-11"
            disabled={!slip || send.isPending}
            onClick={async () => {
              if (!slip || send.isPending) return;
              try {
                await send.mutateAsync({
                  params: { branchSlug, bookingId },
                  body: { fileId: slip.fileId, ...(slip.qrPayload ? { qrPayload: slip.qrPayload } : {}) },
                });
                toast.success(t("slipSent"));
                router.replace(screenPath("L-09", branchSlug, bookingId, screenPath("L-08", branchSlug, bookingId)));
              } catch (error) {
                if (error instanceof ApiClientError && error.code === "HOLD_EXPIRED") setExpired(true);
                else toast.error(errorMessage(error));
              }
            }}
          >
            {t("sendSlip")}
          </Button>
        ) : null}
      </section>
    </div>
  );
}

export function PayScreen({ branchSlug, bookingId }: { branchSlug: string; bookingId: string }) {
  const t = useTranslations("L-07");
  const detail = useApiQuery("liff.booking", { params: { branchSlug, bookingId }, response: LiffBookingResponse });
  return (
    <div className="grid gap-4 p-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      {detail.isPending ? (
        <div className="grid justify-items-center gap-3" aria-busy="true">
          <span className="sr-only">{t("loading")}</span>
          <Skeleton className="h-10 w-40" />
          <Skeleton className="size-60" />
        </div>
      ) : detail.isError ? (
        <div role="alert" className="grid justify-items-start gap-2">
          <p>{errorMessage(detail.error)}</p>
          <Button type="button" variant="outline" onClick={() => detail.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : (
        <PayView detail={detail.data} branchSlug={branchSlug} bookingId={bookingId} />
      )}
    </div>
  );
}
