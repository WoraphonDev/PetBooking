"use client";
// 06#scr-C-09 ext-M3 — Blacklist / กำหนดระดับเอง / ปรับเครดิต (owner) and บันทึกคืนเงิน (OF) with their dialogs.
import type { CustomerDetail } from "@app/contracts/dto/customer-detail";
import { refundModeValues } from "@app/contracts/enums";
import type { useTranslations } from "next-intl";
import { useState } from "react";
import { enumLabel } from "../../lib/enum-label";
import { formatTHB } from "../../lib/format";
import { FormField, MoneyInput } from "../shared/form";
import { PhotoUploader, type RequestTicket, type UploadedPhoto } from "../shared/upload";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Textarea } from "../ui/textarea";
import {
  blacklistBody,
  type CreditErrors,
  type CreditForm,
  type CustomerAction,
  creditBody,
  emptyRefund,
  overrideBody,
  type RefundErrors,
  type RefundForm,
  refundBody,
} from "./actions-logic";

type T = ReturnType<typeof useTranslations<"C-09">>;
const LEVELS = [1, 2, 3, 4] as const;

export function actionLabel(t: T, action: CustomerAction, c: Pick<CustomerDetail, "blacklisted">): string {
  if (action === "blacklist") return t(c.blacklisted ? "unblacklist" : "blacklist");
  return t(({ override: "overrideLevel", credit: "adjustCredit", refund: "recordRefund" } as const)[action]);
}

export function CustomerActionsBar(props: { t: T; c: CustomerDetail; list: CustomerAction[]; onPick: (a: CustomerAction) => void }) {
  if (props.list.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {props.list.map((a) => (
        <Button
          key={a}
          type="button"
          variant={a === "blacklist" && !props.c.blacklisted ? "destructive" : "outline"}
          className="h-11"
          onClick={() => props.onPick(a)}
        >
          {actionLabel(props.t, a, props.c)}
        </Button>
      ))}
    </div>
  );
}

export type ActionSubmit =
  | { kind: "blacklist"; body: NonNullable<ReturnType<typeof blacklistBody>> }
  | { kind: "override"; body: NonNullable<ReturnType<typeof overrideBody>> }
  | { kind: "credit"; body: NonNullable<ReturnType<typeof creditBody>["body"]> }
  | { kind: "refund"; body: NonNullable<ReturnType<typeof refundBody>["body"]> };

export function CustomerActionDialog(props: {
  t: T;
  c: CustomerDetail;
  action: CustomerAction | null;
  requestTicket: RequestTicket;
  busy: boolean;
  cancelLabel: string;
  onClose: () => void;
  onSubmit: (s: ActionSubmit) => Promise<void>;
}) {
  const { t, c, action } = props;
  return (
    <Dialog open={action !== null} onOpenChange={(o) => (o ? null : props.onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action ? actionLabel(t, action, c) : ""}</DialogTitle>
        </DialogHeader>
        {action ? <ActionFields key={action} {...props} action={action} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/** the fields of one action: เหตุผล always; ระดับ 1–4 / อัตโนมัติ; +/− ยอด; ยอด / วิธี / หลักฐาน */
export function ActionFields(props: {
  t: T;
  c: CustomerDetail;
  action: CustomerAction;
  requestTicket: RequestTicket;
  busy: boolean;
  cancelLabel: string;
  onClose: () => void;
  onSubmit: (s: ActionSubmit) => Promise<void>;
}) {
  const { t, c, action } = props;
  const [reason, setReason] = useState("");
  const [level, setLevel] = useState<1 | 2 | 3 | 4 | "auto">((c.reliabilityOverride as 1 | 2 | 3 | 4 | null) ?? "auto");
  const [credit, setCredit] = useState<CreditForm>({ sign: 1, amountSatang: null, reason: "" });
  const [refund, setRefund] = useState<RefundForm>(emptyRefund);
  const [proof, setProof] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<CreditErrors & RefundErrors & { reasonOnly?: true }>({});
  const balance = c.creditBalanceSatang ?? 0;

  const submit = () => {
    let s: ActionSubmit | null = null;
    if (action === "blacklist") {
      const body = blacklistBody(c, reason);
      setErrors(body ? {} : { reasonOnly: true });
      if (body) s = { kind: "blacklist", body };
    } else if (action === "override") {
      const body = overrideBody(level, reason);
      setErrors(body ? {} : { reasonOnly: true });
      if (body) s = { kind: "override", body };
    } else if (action === "credit") {
      const { body, errors: found } = creditBody({ ...credit, reason }, balance);
      setErrors(found);
      if (body) s = { kind: "credit", body };
    } else {
      const { body, errors: found } = refundBody(c.id, { ...refund, reason });
      setErrors(found);
      if (body) s = { kind: "refund", body };
    }
    if (s) void props.onSubmit(s).catch(() => {});
  };
  const pick = <V,>(value: V, options: [V, string][], onPick: (v: V) => void, label: string) => (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map(([v, text]) => (
        <Button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={value === v}
          variant={value === v ? "default" : "outline"}
          className="h-11"
          onClick={() => onPick(v)}
        >
          {text}
        </Button>
      ))}
    </div>
  );

  return (
    <>
      <div className="flex flex-col gap-3">
        {action === "override" ? (
          <FormField id="c09-level" label={t("level")}>
            {pick<1 | 2 | 3 | 4 | "auto">(
              level,
              [...LEVELS.map((l) => [l, t("levelValue", { level: l })] as [1 | 2 | 3 | 4, string]), ["auto", t("levelAuto")]],
              setLevel,
              t("level"),
            )}
          </FormField>
        ) : null}
        {action === "credit" ? (
          <>
            <p className="text-sm">
              {t("balance")}: <span className="tabular-nums">{formatTHB({ satang: balance })}</span>
            </p>
            <FormField
              id="c09-credit-amount"
              label={t("creditDelta")}
              error={errors.amountSatang ? t("invalid") : errors.balance ? t("creditBelowZero") : undefined}
            >
              {pick<1 | -1>(
                credit.sign,
                [
                  [1, t("creditAdd")],
                  [-1, t("creditDeduct")],
                ],
                (sign) => setCredit({ ...credit, sign }),
                t("creditDelta"),
              )}
              <MoneyInput
                id="c09-credit-amount"
                value={credit.amountSatang ?? null}
                onValueChange={(amountSatang) => setCredit({ ...credit, amountSatang })}
              />
            </FormField>
          </>
        ) : null}
        {action === "refund" ? (
          <>
            <FormField id="c09-refund-amount" label={t("refundAmount")} error={errors.amountSatang ? t("invalid") : undefined}>
              <MoneyInput
                id="c09-refund-amount"
                value={refund.amountSatang ?? null}
                onValueChange={(amountSatang) => setRefund({ ...refund, amountSatang })}
              />
            </FormField>
            <FormField id="c09-refund-mode" label={t("refundMode")} error={errors.mode ? t("invalid") : undefined}>
              {pick(
                refund.mode,
                refundModeValues.map((m) => [m, enumLabel("refund_mode", m)] as [typeof m, string]),
                (mode) => setRefund({ ...refund, mode }),
                t("refundMode"),
              )}
            </FormField>
            <FormField id="c09-refund-proof" label={t("refundProof")}>
              <PhotoUploader
                kind="proof"
                requestTicket={props.requestTicket}
                value={proof}
                onBusyChange={setUploading}
                onChange={(next) => {
                  setProof(next);
                  setRefund({ ...refund, proofFileId: next[0]?.fileId ?? null });
                }}
                labels={{ camera: t("camera"), album: t("album"), uploading: t("uploading") }}
              />
            </FormField>
          </>
        ) : null}
        <FormField id="c09-action-reason" label={t("reason")} error={errors.reason || errors.reasonOnly ? t("reasonRequired") : undefined}>
          <Textarea id="c09-action-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-11" onClick={props.onClose}>
          {props.cancelLabel}
        </Button>
        <Button type="button" className="h-11" disabled={props.busy || uploading} onClick={submit}>
          {t("confirmAction")}
        </Button>
      </DialogFooter>
    </>
  );
}
