"use client";
import type { AppointmentCard } from "@app/contracts/dto/appointment-card";
import { BranchGetResponse } from "@app/contracts/endpoints/branch.get";
import { GroomCheckInResponse } from "@app/contracts/endpoints/groom.checkIn";
import { GroomJobCardResponse } from "@app/contracts/endpoints/groom.jobCard";
import { GroomSetItemsResponse } from "@app/contracts/endpoints/groom.setItems";
import { SizeTiersListResponse } from "@app/contracts/endpoints/sizeTiers.list";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { formatTHB, formatWeight } from "../../lib/format";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { FormField, WeightInput } from "../shared/form";
import { SignaturePad } from "../shared/sign";
import { type RequestTicket, staffTicket } from "../shared/upload";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { Textarea } from "../ui/textarea";
import {
  type CheckInErrors,
  type CheckInForm,
  CONDITION_FLAGS,
  CONSENT_REASONS,
  checkInBody,
  consentShown,
  emptyCheckIn,
  type SizeChange,
  setItemsBody,
  sizeChange,
  toggle,
} from "./logic";

type T = ReturnType<typeof useTranslations<"C-06">>;
const INVALIDATE = ["calendar.day", "bookings.get", "groom.jobCard", "dashboard.today"] as const;

export type CheckInDialogProps = {
  /** the scheduled appointment to check in; null = closed */
  appointmentId: string | null;
  onClose: () => void;
};

/** 06#scr-C-06 — receive the pet (weight, condition, consent); dialog on C-02 / C-05 via C-02D's onCheckIn. */
export function CheckInDialog({ appointmentId, onClose }: CheckInDialogProps) {
  const t = useTranslations("C-06");
  const common = useTranslations("common");
  const [size, setSize] = useState<{ appointment: AppointmentCard; change: SizeChange } | null>(null);
  const open = appointmentId !== null && size === null;
  const params = { appointmentId: appointmentId ?? size?.appointment.id ?? "" };
  const job = useApiQuery("groom.jobCard", { params, response: GroomJobCardResponse }, { enabled: open });
  // ข้อความใบยินยอม = branch_policy.grooming_consent_text, ป้ายขนาดใหม่ = size_tier.label_th (Q-1020)
  const branch = useApiQuery("branch.get", { response: BranchGetResponse }, { enabled: open });
  const tiers = useApiQuery("sizeTiers.list", { response: SizeTiersListResponse }, { enabled: size !== null });
  const invalidate = [...INVALIDATE];
  const checkIn = useApiMutation("groom.checkIn", { response: GroomCheckInResponse, invalidate });
  const setItems = useApiMutation("groom.setItems", { response: GroomSetItemsResponse, invalidate });

  const finish = () => {
    setSize(null);
    onClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
          </DialogHeader>
          {job.isError ? (
            <div className="flex flex-col items-start gap-3">
              <p role="alert">{errorMessage(job.error)}</p>
              <Button type="button" onClick={() => void job.refetch()}>
                {common("retry")}
              </Button>
            </div>
          ) : !job.data ? (
            <Skeleton className="h-96" />
          ) : (
            <CheckInFormView
              key={job.data.appointment.id}
              t={t}
              appointment={job.data.appointment}
              consentText={branch.data?.policy.groomingConsentText ?? null}
              requestTicket={staffTicket}
              busy={checkIn.isPending}
              cancelLabel={common("cancel")}
              onCancel={onClose}
              onSubmit={async (body) => {
                const res = await checkIn.mutateAsync({ params, body });
                toast.success(t("checkedIn"));
                const change = sizeChange(res);
                if (change) setSize({ appointment: res, change });
                else onClose();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <SizeDialog
        t={t}
        open={size !== null}
        sizeLabel={tiers.data?.find((x) => x.id === size?.change.newSizeTierId)?.labelTh ?? ""}
        newPriceSatang={size?.change.newPriceSatang ?? null}
        busy={setItems.isPending}
        onKeep={finish}
        onApply={async () => {
          if (!size) return;
          await setItems.mutateAsync({ params: { appointmentId: size.appointment.id }, body: setItemsBody(size.appointment, size.change) });
          toast.success(t("itemsUpdated"));
          finish();
        }}
      />
    </>
  );
}

export function CheckInFormView(props: {
  t: T;
  appointment: AppointmentCard;
  consentText: string | null;
  requestTicket: RequestTicket;
  busy: boolean;
  cancelLabel: string;
  onCancel: () => void;
  onSubmit: (body: NonNullable<ReturnType<typeof checkInBody>["body"]>) => Promise<void>;
}) {
  const { t } = props;
  const [form, setForm] = useState<CheckInForm>(emptyCheckIn);
  const [errors, setErrors] = useState<CheckInErrors>({});
  return (
    <div className="flex flex-col gap-4">
      <PetSection t={t} appointment={props.appointment} />
      <ReceiveFields t={t} form={form} onForm={setForm} errors={errors} />
      {consentShown(form) ? (
        <ConsentFields
          t={t}
          form={form}
          onForm={setForm}
          errors={errors}
          consentText={props.consentText}
          requestTicket={props.requestTicket}
        />
      ) : (
        <Button type="button" variant="outline" className="h-11 self-start" onClick={() => setForm({ ...form, consentAdded: true })}>
          {t("addConsent")}
        </Button>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" className="h-11" onClick={props.onCancel}>
          {props.cancelLabel}
        </Button>
        <Button
          type="button"
          className="h-11"
          disabled={props.busy}
          onClick={() => {
            const { body, errors: found } = checkInBody(form);
            setErrors(found);
            if (body) void props.onSubmit(body).catch(() => {});
          }}
        >
          {t("checkIn")}
        </Button>
      </DialogFooter>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

/** น้อง: header ชื่อ/พันธุ์/ป้ายนิสัย, น้ำหนักล่าสุด, บริการที่จอง (list + ราคา) */
export function PetSection({ t, appointment }: { t: T; appointment: AppointmentCard }) {
  const { pet } = appointment;
  return (
    <Section title={t("sectionPet")}>
      <div>
        <span className="text-muted-foreground text-sm">{t("pet")}</span>
        <p className="font-semibold text-lg">
          {pet.name}
          {pet.breed ? <span className="font-normal text-muted-foreground"> · {pet.breed}</span> : null}
        </p>
        {pet.flags.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {pet.flags.map((f) => (
              <span key={f} className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900 text-xs">
                {enumLabel("temperament_flag", f)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <Row label={t("latestWeight")}>{pet.latestWeightGrams === null ? "–" : formatWeight({ grams: pet.latestWeightGrams })}</Row>
      <div className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{t("items")}</span>
        <ul className="flex flex-col gap-1">
          {appointment.items.map((i) => (
            <li key={i.serviceId} className="flex justify-between gap-3">
              <span>{i.name}</span>
              <span>{formatTHB({ satang: i.priceSatang })}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

type FieldsProps = { t: T; form: CheckInForm; onForm: (f: CheckInForm) => void; errors: CheckInErrors };

/** ตรวจรับ: น้ำหนักวันนี้ (กก. → กรัม), สภาพที่พบ, รายละเอียด */
export function ReceiveFields({ t, form, onForm, errors }: FieldsProps) {
  return (
    <Section title={t("sectionReceive")}>
      <FormField id="c06-weight" label={`${t("weightToday")} (${t("weightHint")})`} error={errors.weightGrams ? t("invalid") : undefined}>
        <WeightInput id="c06-weight" value={form.weightGrams ?? null} onValueChange={(v) => onForm({ ...form, weightGrams: v })} />
      </FormField>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-medium text-sm">{t("conditions")}</legend>
        {CONDITION_FLAGS.map((flag) => (
          <label key={flag} className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-5"
              checked={form.conditionFlags.includes(flag)}
              onChange={(e) => onForm({ ...form, conditionFlags: toggle(form.conditionFlags, flag, e.target.checked) })}
            />
            {t(`condition_${flag}`)}
          </label>
        ))}
      </fieldset>
      <FormField id="c06-note" label={t("conditionNote")} error={errors.conditionNote ? t("invalid") : undefined}>
        <Textarea
          id="c06-note"
          maxLength={500}
          value={form.conditionNote}
          onChange={(e) => onForm({ ...form, conditionNote: e.target.value })}
        />
      </FormField>
    </Section>
  );
}

/** ใบยินยอม: เหตุผล ≥ 1, ข้อความใบยินยอม (scroll), ชื่อผู้เซ็น, ลายเซ็น (PNG kind signature) */
export function ConsentFields(props: FieldsProps & { consentText: string | null; requestTicket: RequestTicket }) {
  const { t, form, onForm, errors } = props;
  return (
    <Section title={t("sectionConsent")}>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-medium text-sm">{t("reasons")}</legend>
        {CONSENT_REASONS.map((reason) => (
          <label key={reason} className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-5"
              checked={form.reasons.includes(reason)}
              onChange={(e) => onForm({ ...form, reasons: toggle(form.reasons, reason, e.target.checked) })}
            />
            {t(`reason_${reason}`)}
          </label>
        ))}
        {errors.reasons ? (
          <p role="alert" className="text-destructive text-sm">
            {t("required")}
          </p>
        ) : null}
      </fieldset>
      <div className="flex flex-col gap-2">
        <span className="font-medium text-sm">{t("consentText")}</span>
        <div className="max-h-40 overflow-y-auto whitespace-pre-line rounded-lg border p-3 text-sm">
          {props.consentText ?? t("consentTextEmpty")}
        </div>
      </div>
      <FormField id="c06-signer" label={t("signerName")} error={errors.signerName ? t("required") : undefined}>
        <Input
          id="c06-signer"
          className="h-11"
          maxLength={100}
          value={form.signerName}
          onChange={(e) => onForm({ ...form, signerName: e.target.value })}
        />
      </FormField>
      <div className="flex flex-col gap-2">
        <span className="font-medium text-sm">{t("signature")}</span>
        <SignaturePad
          requestTicket={props.requestTicket}
          labels={{
            area: t("signatureArea"),
            clear: t("signatureClear"),
            confirm: t("signatureConfirm"),
            uploading: t("signatureUploading"),
            signed: t("signatureSigned"),
          }}
          onChange={(fileId) => onForm({ ...form, signatureFileId: fileId })}
        />
        {errors.signatureFileId ? (
          <p role="alert" className="text-destructive text-sm">
            {t("required")}
          </p>
        ) : null}
      </div>
    </Section>
  );
}

type SizeProps = {
  t: T;
  sizeLabel: string;
  newPriceSatang: number | null;
  busy: boolean;
  onKeep: () => void;
  onApply: () => Promise<void>;
};

/** 'ขนาดเปลี่ยนเป็น X ราคาใหม่ ฿xxx ปรับไหม' → ปรับบริการ/ขนาดตามน้ำหนักวันนี้ (groom.setItems) */
export function SizeDialog(props: SizeProps & { open: boolean }) {
  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? null : props.onKeep())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.t("sizeTitle")}</DialogTitle>
        </DialogHeader>
        <SizeQuestion {...props} />
      </DialogContent>
    </Dialog>
  );
}

export function SizeQuestion({ t, ...props }: SizeProps) {
  const price = props.newPriceSatang === null ? t("priceUnknown") : formatTHB({ satang: props.newPriceSatang });
  return (
    <>
      <p>{t("sizeChanged", { size: props.sizeLabel, price })}</p>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-11" onClick={props.onKeep}>
          {t("keep")}
        </Button>
        <Button type="button" className="h-11" disabled={props.busy} onClick={() => void props.onApply().catch(() => {})}>
          {t("applySize")}
        </Button>
      </DialogFooter>
    </>
  );
}
