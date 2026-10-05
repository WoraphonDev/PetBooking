"use client";
import type { SlipItem } from "@app/contracts/dto/slip-item";
import { SlipsListResponse } from "@app/contracts/endpoints/slips.list";
import { SlipsRejectResponse } from "@app/contracts/endpoints/slips.reject";
import { SlipsVerifyResponse } from "@app/contracts/endpoints/slips.verify";
import { toLocalDate } from "@app/domain/time/local-time";
import Link from "next/link";
import { useTimeZone, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "../../lib/api";
import { formatTHB, formatThaiDate, formatTime } from "../../lib/format";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { FormField, MoneyInput } from "../shared/form";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Skeleton } from "../ui/skeleton";
import { Textarea } from "../ui/textarea";
import { canApprove, canReview, oldestFirst, timeAgo, verifyBody } from "./logic";

type T = ReturnType<typeof useTranslations<"C-07">>;
const INVALIDATE = ["slips.list", "bookings.get", "bookings.list", "dashboard.today"] as const;
type Verify = { slip: SlipItem; amountSatang: number; approveBooking: boolean };

/** 06#scr-C-07 — slips the customers sent; the shop checks the money really arrived before verifying. */
export function SlipsScreen() {
  const t = useTranslations("C-07");
  const common = useTranslations("common");
  const timezone = useTimeZone() ?? "Asia/Bangkok";
  const list = useApiQuery("slips.list", { query: { status: "submitted" }, response: SlipsListResponse });
  const invalidate = [...INVALIDATE];
  const verify = useApiMutation("slips.verify", { response: SlipsVerifyResponse, invalidate });
  const reject = useApiMutation("slips.reject", { response: SlipsRejectResponse, invalidate });
  const [duplicate, setDuplicate] = useState<Verify | null>(null);
  const [rejecting, setRejecting] = useState<SlipItem | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  if (list.isPending) return <Skeleton className="m-6 h-96" />;
  if (list.isError)
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p role="alert">{errorMessage(list.error)}</p>
        <Button type="button" onClick={() => void list.refetch()}>
          {common("retry")}
        </Button>
      </div>
    );
  const send = async (v: Verify, confirmDuplicate: boolean) => {
    const body = verifyBody(v.amountSatang, { approveBooking: v.approveBooking, confirmDuplicate });
    if (!body) return;
    await verify.mutateAsync({ params: { slipId: v.slip.id }, body });
    setDuplicate(null);
    toast.success(t("verified"));
  };
  return (
    <div data-screen="C-07" className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>
      <p className="text-muted-foreground text-sm">{t("hint")}</p>
      {list.data.length === 0 ? <p className="text-muted-foreground">{t("empty")}</p> : null}
      <ul className="flex flex-col gap-3">
        {oldestFirst(list.data).map((s) => (
          <li key={s.id}>
            <SlipCard
              t={t}
              slip={s}
              now={Date.now()}
              timezone={timezone}
              busy={verify.isPending || reject.isPending}
              onZoom={setZoom}
              // สลิปซ้ำ → dialog ยืนยันชั้นที่ 2 (confirmDuplicate)
              onVerify={(v) => (s.isDuplicate ? setDuplicate(v) : void send(v, false).catch(() => {}))}
              onReject={() => setRejecting(s)}
            />
          </li>
        ))}
      </ul>
      <Dialog open={zoom !== null} onOpenChange={(o) => (o ? null : setZoom(null))}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("image")}</DialogTitle>
          </DialogHeader>
          {/* biome-ignore lint/performance/noImgElement: signed storage URL, not a Next static asset */}
          {zoom ? <img src={zoom} alt={t("image")} className="max-h-[75vh] w-full object-contain" /> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={duplicate !== null} onOpenChange={(o) => (o ? null : setDuplicate(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("duplicateTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm">{t("duplicateBody")}</p>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={() => setDuplicate(null)}>
              {common("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-11"
              disabled={verify.isPending}
              onClick={() => duplicate && void send(duplicate, true).catch(() => {})}
            >
              {t("confirmDuplicate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RejectDialog
        t={t}
        open={rejecting !== null}
        busy={reject.isPending}
        cancelLabel={common("cancel")}
        onClose={() => setRejecting(null)}
        onConfirm={async (reason) => {
          if (!rejecting) return;
          await reject.mutateAsync({ params: { slipId: rejecting.id }, body: { reason } });
          setRejecting(null);
          toast.success(t("rejected"));
        }}
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

/** one slip: รูป / ใบจอง / ลูกค้า / ยอด / เลขอ้างอิง / สลิปซ้ำ / ส่งเมื่อ / คิวถูกกันถึง + ยอดที่เข้าจริง and the buttons */
export function SlipCard(props: {
  t: T;
  slip: SlipItem;
  now: number;
  timezone: string;
  busy: boolean;
  onZoom: (url: string) => void;
  onVerify: (v: Verify) => void;
  onReject: () => void;
}) {
  const { t, slip: s, timezone } = props;
  // prefill = ยอดที่ต้องจ่าย
  const [amount, setAmount] = useState<number | null | undefined>(s.amountExpectedSatang);
  const ago = timeAgo(s.uploadedAt, props.now);
  const valid = verifyBody(amount, { approveBooking: false, confirmDuplicate: false }) !== null;
  return (
    <article id={`slip-${s.id}`} className="flex flex-col gap-3 rounded-xl border p-4 md:flex-row">
      <div className="shrink-0">
        {s.imageUrl ? (
          <button type="button" aria-label={t("enlarge")} onClick={() => s.imageUrl && props.onZoom(s.imageUrl)}>
            {/* biome-ignore lint/performance/noImgElement: signed storage URL, not a Next static asset */}
            <img src={s.imageUrl} alt={t("image")} className="h-40 w-28 rounded object-cover" />
          </button>
        ) : (
          <span className="flex h-40 w-28 items-center justify-center rounded bg-muted text-muted-foreground text-xs">{t("noImage")}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <Row label={t("booking")}>
          {s.bookingId ? (
            <Link href={`/console/bookings/${s.bookingId}`} className="font-mono underline-offset-4 hover:underline">
              {s.bookingNo}
            </Link>
          ) : (
            "-"
          )}
        </Row>
        <Row label={t("customer")}>{s.customerName}</Row>
        <Row label={t("amountExpected")}>
          <span className="tabular-nums">{formatTHB({ satang: s.amountExpectedSatang })}</span>
        </Row>
        <Row label={t("transRef")}>
          <span className="font-mono">{s.transRef ?? "-"}</span>
        </Row>
        {s.isDuplicate ? (
          <Row label={t("duplicate")}>
            <span className="rounded-full bg-destructive px-2 py-0.5 text-white text-xs">{t("usedBefore")}</span>
            {s.duplicateOfSlipId ? (
              <a href={`#slip-${s.duplicateOfSlipId}`} className="ml-2 underline">
                {t("originalSlip")}
              </a>
            ) : null}
          </Row>
        ) : null}
        <Row label={t("uploadedAt")}>{t(ago.key, { n: ago.n })}</Row>
        {s.holdExpiresAt ? (
          <Row label={t("holdUntil")}>
            {formatThaiDate({ date: toLocalDate({ instant: s.holdExpiresAt, timezone }) })}{" "}
            {formatTime({ instant: s.holdExpiresAt, timezone })}
          </Row>
        ) : null}
      </div>
      {canReview(s) ? (
        <div className="flex flex-col gap-2 md:w-64">
          <FormField id={`c07-amount-${s.id}`} label={t("amountReceived")} error={valid ? undefined : t("invalid")}>
            <MoneyInput id={`c07-amount-${s.id}`} value={amount ?? null} onValueChange={setAmount} />
          </FormField>
          <Button
            type="button"
            className="h-11"
            disabled={props.busy || !valid}
            onClick={() => props.onVerify({ slip: s, amountSatang: amount as number, approveBooking: false })}
          >
            {t("verify")}
          </Button>
          {canApprove(s) ? (
            <Button
              type="button"
              variant="secondary"
              className="h-11"
              disabled={props.busy || !valid}
              onClick={() => props.onVerify({ slip: s, amountSatang: amount as number, approveBooking: true })}
            >
              {t("verifyApprove")}
            </Button>
          ) : null}
          <Button type="button" variant="outline" className="h-11" disabled={props.busy} onClick={props.onReject}>
            {t("reject")}
          </Button>
        </div>
      ) : null}
    </article>
  );
}

/** ปฏิเสธ: เหตุผล 3–500, the customer sees it */
export function RejectDialog(props: {
  t: T;
  open: boolean;
  busy: boolean;
  cancelLabel: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const { t } = props;
  const [reason, setReason] = useState("");
  const ok = reason.trim().length >= 3;
  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? null : props.onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("reject")}</DialogTitle>
        </DialogHeader>
        <FormField id="c07-reject-reason" label={t("rejectReason")}>
          <Textarea id="c07-reject-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" onClick={props.onClose}>
            {props.cancelLabel}
          </Button>
          <Button
            type="button"
            className="h-11"
            disabled={!ok || props.busy}
            onClick={() =>
              void props
                .onConfirm(reason.trim())
                .then(() => setReason(""))
                .catch(() => {})
            }
          >
            {t("confirmReject")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
