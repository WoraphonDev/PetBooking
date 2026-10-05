"use client";
import type { BranchPolicy } from "@app/contracts/dto/branch-policy";
import { BranchGetResponse } from "@app/contracts/endpoints/branch.get";
import { BranchUpdatePolicyResponse } from "@app/contracts/endpoints/branch.updatePolicy";
import { depositTypeValues } from "@app/contracts/enums";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { formatTHB } from "../../lib/format";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { FormField, MoneyInput, TimeSelect, WeightInput } from "../shared/form";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import {
  addTag,
  depositExample,
  EXAMPLE_TOTAL_SATANG,
  generatePolicyText,
  HOLD_OPTIONS,
  LEAD_OPTIONS,
  POLICY_TEXT_MAX,
  type PolicyErrors,
  parseIntField,
  SLOT_STEP_OPTIONS,
  TEMPLATES,
  updateBody,
  vaccineTypes,
  validatePolicy,
} from "./logic";

type T = ReturnType<typeof useTranslations<"C-33">>;
type Key = keyof BranchPolicy;
const REFUND_MODES = ["refund", "credit", "customer_choice"] as const;
const selectClass = "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm";

/** 06#scr-C-33 — owner-only shop policy (deposit, cancellation, booking, pets, documents, messages). */
export function PolicyScreen() {
  const t = useTranslations("C-33");
  const common = useTranslations("common");
  const branch = useApiQuery("branch.get", { response: BranchGetResponse });
  const [draft, setDraft] = useState<BranchPolicy | null>(null);
  const [errors, setErrors] = useState<PolicyErrors>({});
  const save = useApiMutation("branch.updatePolicy", { response: BranchUpdatePolicyResponse, invalidate: ["branch.get"] });

  if (branch.isPending) return <Skeleton className="m-6 h-96" />;
  if (branch.isError)
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p role="alert">{errorMessage(branch.error)}</p>
        <Button type="button" onClick={() => void branch.refetch()}>
          {common("retry")}
        </Button>
      </div>
    );

  const policy = draft ?? branch.data.policy;
  const onSave = async () => {
    const found = validatePolicy(policy);
    setErrors(found);
    if (Object.keys(found).length) return;
    await save.mutateAsync({ body: updateBody(policy) });
    setDraft(null);
    toast.success(t("saved"));
  };
  return <PolicyForm t={t} policy={policy} onChange={setDraft} errors={errors} saving={save.isPending} onSave={onSave} />;
}

export function PolicyForm(props: {
  t: T;
  policy: BranchPolicy;
  onChange: (p: BranchPolicy) => void;
  errors: PolicyErrors;
  saving: boolean;
  onSave: () => void;
}) {
  const { t, policy: p, errors } = props;
  const set = <K extends Key>(key: K, value: BranchPolicy[K]) => props.onChange({ ...p, [key]: value });
  const err = (key: Key) => (errors[key] ? t("invalid") : undefined);
  const [breed, setBreed] = useState("");

  /** number input bound to an int field (`nullable` = empty allowed) */
  const num = (key: Key, nullable = false, extra: ReactNode = null) => (
    <FormField id={`c33-${key}`} label={t(key as never)} error={err(key)}>
      <Input
        id={`c33-${key}`}
        className="h-11"
        inputMode="numeric"
        aria-invalid={!!errors[key]}
        value={p[key] === null || Number.isNaN(p[key]) ? "" : String(p[key])}
        onChange={(e) => {
          const v = parseIntField(e.target.value);
          set(key, (v === null && !nullable ? Number.NaN : v) as never);
        }}
      />
      {extra}
    </FormField>
  );
  const toggle = (key: Key, help: ReactNode = null) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`c33-${key}`} className="flex min-h-11 items-center justify-between gap-3">
        <span className="font-medium text-sm">{t(key as never)}</span>
        <Switch id={`c33-${key}`} checked={p[key] as boolean} onCheckedChange={(v) => set(key, v as never)} />
      </label>
      {help}
    </div>
  );
  const choice = (key: Key, options: readonly number[], label: (n: number) => string) => (
    <FormField id={`c33-${key}`} label={t(key as never)} error={err(key)}>
      <select id={`c33-${key}`} className={selectClass} value={String(p[key])} onChange={(e) => set(key, Number(e.target.value) as never)}>
        {(options.includes(p[key] as number) ? options : [p[key] as number, ...options]).map((n) => (
          <option key={n} value={n}>
            {label(n)}
          </option>
        ))}
      </select>
    </FormField>
  );
  const vaccines = (key: "requiredVaccinesDog" | "requiredVaccinesCat", species: "dog" | "cat") => (
    <FormField id={`c33-${key}`} label={t(key)}>
      <fieldset id={`c33-${key}`} className="flex flex-col gap-1">
        {vaccineTypes(species).map((v) => (
          <label key={v.code} className="flex min-h-11 items-center gap-3 rounded-lg border px-3">
            <input
              type="checkbox"
              checked={p[key].includes(v.code)}
              onChange={(e) => set(key, e.target.checked ? [...p[key], v.code] : p[key].filter((c) => c !== v.code))}
            />
            {v.nameTh}
          </label>
        ))}
      </fieldset>
    </FormField>
  );
  const templateText = (key: "groomingConsentText" | "boardingAgreementText") => (
    <FormField id={`c33-${key}`} label={t(key)}>
      <Textarea id={`c33-${key}`} value={p[key] ?? ""} onChange={(e) => set(key, e.target.value)} />
      <Button type="button" variant="outline" className="h-11 self-start" onClick={() => set(key, TEMPLATES[key])}>
        {t("useTemplate")}
      </Button>
    </FormField>
  );
  const minutes = (n: number) => t("minutes", { n });

  return (
    <div data-screen="C-33" className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>

      <Section title={t("sectionDeposit")}>
        <FormField id="c33-depositType" label={t("depositType")}>
          <div id="c33-depositType" role="radiogroup" className="flex gap-2">
            {depositTypeValues.map((v) => (
              <Button
                key={v}
                type="button"
                role="radio"
                aria-checked={p.defaultDepositType === v}
                variant={p.defaultDepositType === v ? "default" : "outline"}
                className="h-11"
                onClick={() =>
                  props.onChange({
                    ...p,
                    defaultDepositType: v,
                    defaultDepositValue: v === p.defaultDepositType ? p.defaultDepositValue : 0,
                  })
                }
              >
                {enumLabel("deposit_type", v)}
              </Button>
            ))}
          </div>
        </FormField>
        {p.defaultDepositType === "fixed" ? (
          <FormField id="c33-depositValue" label={t("depositValue")} error={err("defaultDepositValue")}>
            <MoneyInput
              id="c33-depositValue"
              value={p.defaultDepositValue}
              onValueChange={(v) => set("defaultDepositValue", v === undefined ? Number.NaN : (v ?? 0))}
            />
          </FormField>
        ) : p.defaultDepositType === "percent" ? (
          num("defaultDepositValue")
        ) : null}
        <p data-field="example" className="text-sm">
          <span className="text-muted-foreground">{t("example")}: </span>
          {Number.isNaN(p.defaultDepositValue) || errors.defaultDepositValue
            ? "–"
            : t("exampleText", {
                total: formatTHB({ satang: EXAMPLE_TOTAL_SATANG }),
                deposit: formatTHB({ satang: depositExample(p) }),
              })}
        </p>
      </Section>

      <Section title={t("sectionCancel")}>
        {num("groomingFreeCancelHours")}
        {num("hotelFreeCancelHours")}
        {num("daycareFreeCancelHours")}
        <FormField id="c33-lateCancelForfeitPercent" label={t("lateCancelForfeitPercent")} error={err("lateCancelForfeitPercent")}>
          <div className="flex items-center gap-3">
            <input
              id="c33-lateCancelForfeitPercent"
              type="range"
              min={0}
              max={100}
              step={10}
              className="flex-1"
              value={p.lateCancelForfeitPercent}
              onChange={(e) => set("lateCancelForfeitPercent", Number(e.target.value))}
            />
            <span className="w-12 text-right tabular-nums">{p.lateCancelForfeitPercent}%</span>
          </div>
        </FormField>
        <FormField id="c33-cancelRefundMode" label={t("cancelRefundMode")}>
          <div id="c33-cancelRefundMode" role="radiogroup" className="flex flex-wrap gap-2">
            {REFUND_MODES.map((v) => (
              <Button
                key={v}
                type="button"
                role="radio"
                aria-checked={p.cancelRefundMode === v}
                variant={p.cancelRefundMode === v ? "default" : "outline"}
                className="h-11"
                onClick={() => set("cancelRefundMode", v)}
              >
                {enumLabel("cancel_refund_mode", v)}
              </Button>
            ))}
          </div>
        </FormField>
        {num("rescheduleCutoffHours")}
        {num("noShowGraceMinutes")}
        <FormField id="c33-policyText" label={t("policyText")} error={err("policyText")}>
          <Textarea
            id="c33-policyText"
            maxLength={POLICY_TEXT_MAX}
            value={p.policyText ?? ""}
            onChange={(e) => set("policyText", e.target.value)}
          />
          <Button type="button" variant="outline" className="h-11 self-start" onClick={() => set("policyText", generatePolicyText(p))}>
            {t("generatePolicyText")}
          </Button>
        </FormField>
      </Section>

      <Section title={t("sectionBooking")}>
        {choice("bookingLeadMinutes", LEAD_OPTIONS, minutes)}
        {num("bookingHorizonDays")}
        {choice("slotStepMinutes", SLOT_STEP_OPTIONS, minutes)}
        {num("bufferMinutes")}
        {num("maxAppointmentsPerDay", true, <p className="text-muted-foreground text-xs">{t("unlimited")}</p>)}
        {num("maxAppointmentsPerGroomerDay", true)}
        {choice("holdMinutes", HOLD_OPTIONS, minutes)}
        {toggle("autoConfirmGrooming")}
        {toggle("autoConfirmHotel")}
        {toggle("autoConfirmDaycare")}
        {num("approvalTimeoutMinutes")}
      </Section>

      <Section title={t("sectionPets")}>
        {vaccines("requiredVaccinesDog", "dog")}
        {vaccines("requiredVaccinesCat", "cat")}
        {toggle("enforceVaccinesGrooming")}
        <FormField id="c33-rejectedBreeds" label={t("rejectedBreeds")}>
          <ul className="flex flex-wrap gap-2">
            {p.rejectedBreeds.map((b) => (
              <li key={b} className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm">
                {b}
                <button
                  type="button"
                  aria-label={t("removeBreed", { breed: b })}
                  onClick={() =>
                    set(
                      "rejectedBreeds",
                      p.rejectedBreeds.filter((x) => x !== b),
                    )
                  }
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input
              id="c33-rejectedBreeds"
              className="h-11"
              value={breed}
              onChange={(e) => setBreed(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                set("rejectedBreeds", addTag(p.rejectedBreeds, breed));
                setBreed("");
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => {
                set("rejectedBreeds", addTag(p.rejectedBreeds, breed));
                setBreed("");
              }}
            >
              {t("addBreed")}
            </Button>
          </div>
        </FormField>
        <FormField id="c33-maxPetWeight" label={t("maxPetWeight")} error={err("maxPetWeightGrams")}>
          <WeightInput
            id="c33-maxPetWeight"
            value={p.maxPetWeightGrams}
            onValueChange={(v) => set("maxPetWeightGrams", v === undefined ? Number.NaN : v)}
          />
        </FormField>
      </Section>

      <Section title={t("sectionDocs")}>
        {templateText("groomingConsentText")}
        {templateText("boardingAgreementText")}
      </Section>

      <Section title={t("sectionAfter")}>
        {toggle("reminder24hEnabled")}
        {/* 07: templates with economy mode = skip */}
        {toggle("economyMode", <p className="text-muted-foreground text-xs">{t("economyHelp")}</p>)}
        {num("nextGroomDefaultDays")}
        <FormField id="c33-googleReviewUrl" label={t("googleReviewUrl")} error={err("googleReviewUrl")}>
          <Input
            id="c33-googleReviewUrl"
            type="url"
            inputMode="url"
            className="h-11"
            value={p.googleReviewUrl ?? ""}
            onChange={(e) => set("googleReviewUrl", e.target.value || null)}
          />
        </FormField>
        {toggle("reportCardRequiresReview")}
        <FormField id="c33-dailySummaryTime" label={t("dailySummaryTime")} error={err("dailySummaryTime")}>
          <TimeSelect
            id="c33-dailySummaryTime"
            value={p.dailySummaryTime}
            stepMinutes={30}
            onValueChange={(v) => v && set("dailySummaryTime", v)}
          />
        </FormField>
      </Section>

      <div className="flex justify-end">
        <Button type="button" className="h-11" disabled={props.saving} onClick={props.onSave}>
          {t("save")}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4">
      <h2 className="font-medium text-lg">{title}</h2>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}
