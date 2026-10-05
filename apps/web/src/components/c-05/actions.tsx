"use client";
// 06#scr-C-05 ext-M3 — รับมัดจำ dialog, R-07 cancel preview and ส่งลิงก์จ่ายยอดคงเหลือ.
import type { BookingsBalanceLinkResponse } from "@app/contracts/endpoints/bookings.balanceLink";
import type { BookingsCancelPreviewResponse } from "@app/contracts/endpoints/bookings.cancelPreview";
import type { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { enumLabel } from "../../lib/enum-label";
import { formatTHB } from "../../lib/format";
import { FormField, MoneyInput } from "../shared/form";
import { PhotoUploader, type RequestTicket, type UploadedPhoto } from "../shared/upload";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { DEPOSIT_METHODS, type DepositErrors, type DepositForm, depositBody } from "./logic";

type T = ReturnType<typeof useTranslations<"C-05">>;

/** รับมัดจำ: วิธี, ยอด, เลขอ้างอิง, รูปหลักฐาน (kind proof) */
export function DepositDialog(props: {
  t: T;
  open: boolean;
  initial: DepositForm;
  requestTicket: RequestTicket;
  busy: boolean;
  cancelLabel: string;
  onClose: () => void;
  onSave: (body: NonNullable<ReturnType<typeof depositBody>["body"]>) => Promise<void>;
}) {
  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? null : props.onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.t("recordDeposit")}</DialogTitle>
        </DialogHeader>
        {props.open ? <DepositFields {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

export function DepositFields(props: {
  t: T;
  initial: DepositForm;
  requestTicket: RequestTicket;
  busy: boolean;
  cancelLabel: string;
  onClose: () => void;
  onSave: (body: NonNullable<ReturnType<typeof depositBody>["body"]>) => Promise<void>;
}) {
  const { t } = props;
  const [form, setForm] = useState<DepositForm>(props.initial);
  const [errors, setErrors] = useState<DepositErrors>({});
  const [proof, setProof] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  return (
    <>
      <div className="flex flex-col gap-3">
        <FormField id="c05-dep-method" label={t("depositMethod")} error={errors.method ? t("invalid") : undefined}>
          <div role="radiogroup" aria-label={t("depositMethod")} className="flex flex-wrap gap-2">
            {DEPOSIT_METHODS.map((m) => (
              <Button
                key={m}
                type="button"
                role="radio"
                aria-checked={form.method === m}
                variant={form.method === m ? "default" : "outline"}
                className="h-11"
                onClick={() => setForm({ ...form, method: m })}
              >
                {enumLabel("payment_method", m)}
              </Button>
            ))}
          </div>
        </FormField>
        <FormField id="c05-dep-amount" label={t("depositAmount")} error={errors.amountSatang ? t("invalid") : undefined}>
          <MoneyInput
            id="c05-dep-amount"
            value={form.amountSatang ?? null}
            onValueChange={(amountSatang) => setForm({ ...form, amountSatang })}
          />
        </FormField>
        <FormField id="c05-dep-ref" label={t("depositReference")} error={errors.reference ? t("invalid") : undefined}>
          <Input
            id="c05-dep-ref"
            className="h-11"
            maxLength={100}
            value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
          />
        </FormField>
        <FormField id="c05-dep-proof" label={t("depositProof")}>
          <PhotoUploader
            kind="proof"
            requestTicket={props.requestTicket}
            value={proof}
            onBusyChange={setUploading}
            onChange={(next) => {
              setProof(next);
              setForm({ ...form, proofFileId: next[0]?.fileId ?? null });
            }}
            labels={{ camera: t("camera"), album: t("album"), uploading: t("uploading") }}
          />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-11" onClick={props.onClose}>
          {props.cancelLabel}
        </Button>
        <Button
          type="button"
          className="h-11"
          disabled={props.busy || uploading}
          onClick={() => {
            const { body, errors: found } = depositBody(form);
            setErrors(found);
            if (body) void props.onSave(body).catch(() => {});
          }}
        >
          {t("saveDeposit")}
        </Button>
      </DialogFooter>
    </>
  );
}

/** แสดงผลเงิน R-07 ก่อนยืนยัน (bookings.cancelPreview) */
export function CancelPreview({ t, preview }: { t: T; preview: BookingsCancelPreviewResponse }) {
  return (
    <div data-field="cancel-preview" className="flex flex-col gap-1 rounded-lg bg-muted p-3 text-sm">
      <span className="font-medium">{t(preview.isLate ? "previewLate" : "previewFree", { hours: preview.freeCancelHours })}</span>
      <span>
        {t("previewForfeit")}: <span className="tabular-nums">{formatTHB({ satang: preview.forfeitSatang })}</span>
      </span>
      <span>
        {t("previewReturn")}: <span className="tabular-nums">{formatTHB({ satang: preview.returnSatang })}</span>
        {preview.returnMode && preview.returnMode !== "none" ? ` (${enumLabel("cancel_refund_mode", preview.returnMode)})` : ""}
      </span>
    </div>
  );
}

/** ส่งลิงก์จ่ายยอดคงเหลือ: copy link / ส่ง LINE */
export function BalanceLinkDialog(props: {
  t: T;
  link: BookingsBalanceLinkResponse | null;
  busy: boolean;
  closeLabel: string;
  onClose: () => void;
  onSendLine: () => Promise<void>;
}) {
  const { t, link } = props;
  return (
    <Dialog open={link !== null} onOpenChange={(o) => (o ? null : props.onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("balanceLink")}</DialogTitle>
        </DialogHeader>
        {link ? <BalanceLinkBody t={t} link={link} /> : null}
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" onClick={props.onClose}>
            {props.closeLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => link && void navigator.clipboard.writeText(link.url).then(() => toast.success(t("copied")))}
          >
            {t("copyLink")}
          </Button>
          <Button type="button" className="h-11" disabled={props.busy} onClick={() => void props.onSendLine().catch(() => {})}>
            {t("sendLine")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BalanceLinkBody({ t, link }: { t: T; link: BookingsBalanceLinkResponse }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        {t("balanceDue")}: <span className="font-medium tabular-nums">{formatTHB({ satang: link.amountSatang })}</span>
      </p>
      <Input readOnly className="h-11 font-mono text-xs" value={link.url} aria-label={t("balanceLink")} />
    </div>
  );
}
