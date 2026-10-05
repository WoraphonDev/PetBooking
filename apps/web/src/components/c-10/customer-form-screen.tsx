"use client";
import { AuthMeResponse } from "@app/contracts/endpoints/auth.me";
import { CustomersCreateResponse } from "@app/contracts/endpoints/customers.create";
import { CustomersGetResponse } from "@app/contracts/endpoints/customers.get";
import { CustomersUpdateResponse } from "@app/contracts/endpoints/customers.update";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { EnumSelect, FormField, PhoneInput, ThaiDatePicker } from "../shared/form";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import {
  type CustomerForm,
  createBody,
  duplicateIds,
  emptyForm,
  type FormErrors,
  followUpBody,
  formFrom,
  PHOTO_CONSENTS,
  PROVINCES,
  updateBody,
  validate,
} from "./logic";

type T = ReturnType<typeof useTranslations<"C-10">>;
const selectClass = "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm";

/** 06#scr-C-10 — add (customerId null) or edit a customer; saves → C-09. */
export function CustomerFormScreen({ customerId }: { customerId: string | null }) {
  const t = useTranslations("C-10");
  const common = useTranslations("common");
  const router = useRouter();
  const me = useApiQuery("auth.me", { response: AuthMeResponse });
  const existing = useApiQuery(
    "customers.get",
    { params: { customerId: customerId ?? "" }, response: CustomersGetResponse },
    { enabled: !!customerId },
  );
  const [draft, setDraft] = useState<CustomerForm | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [duplicates, setDuplicates] = useState<{ created: string; ids: string[] } | null>(null);
  const create = useApiMutation("customers.create", { response: CustomersCreateResponse, invalidate: ["customers.list", "search.quick"] });
  const update = useApiMutation("customers.update", {
    response: CustomersUpdateResponse,
    invalidate: ["customers.list", "customers.get", "search.quick"],
  });
  const isOwner = me.data?.staff.role === "owner";

  if (customerId && existing.isPending) return <Skeleton className="m-6 h-96" />;
  if (customerId && existing.isError)
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p role="alert">{errorMessage(existing.error)}</p>
        <Button type="button" onClick={() => void existing.refetch()}>
          {common("retry")}
        </Button>
      </div>
    );
  const form = draft ?? (existing.data ? formFrom(existing.data) : emptyForm());
  const toCustomer = (id: string) => router.push(`/console/customers/${id}`);

  const save = async () => {
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    if (customerId) {
      await update.mutateAsync({ params: { customerId }, body: updateBody(form, isOwner) });
      toast.success(t("saved"));
      toCustomer(customerId);
      return;
    }
    const created = await create.mutateAsync({ body: createBody(form) });
    const rest = followUpBody(form, isOwner);
    if (rest) await update.mutateAsync({ params: { customerId: created.id }, body: rest });
    toast.success(t("saved"));
    const ids = duplicateIds(created.warnings);
    // เบอร์ซ้ำ → แถบเตือน + ลิงก์ลูกค้าเดิม before moving on
    if (ids.length) setDuplicates({ created: created.id, ids });
    else toCustomer(created.id);
  };

  return (
    <CustomerFormView
      t={t}
      editing={!!customerId}
      form={form}
      onChange={setDraft}
      errors={errors}
      isOwner={isOwner}
      saving={create.isPending || update.isPending}
      onSave={() => void save()}
      duplicates={duplicates}
      onContinue={() => duplicates && toCustomer(duplicates.created)}
    />
  );
}

export function CustomerFormView(props: {
  t: T;
  editing: boolean;
  form: CustomerForm;
  onChange: (f: CustomerForm) => void;
  errors: FormErrors;
  isOwner: boolean;
  saving: boolean;
  onSave: () => void;
  duplicates: { created: string; ids: string[] } | null;
  onContinue: () => void;
}) {
  const { t, form, errors } = props;
  const set = <K extends keyof CustomerForm>(key: K, value: CustomerForm[K]) => props.onChange({ ...form, [key]: value });
  const err = (key: keyof CustomerForm) => (errors[key] ? t("invalid") : undefined);
  // phones are kept as E.164; an unparseable entry is kept as "x" so validate() flags it (R-22 INVALID_PHONE)
  const textField = (key: keyof CustomerForm, extra: Partial<React.ComponentProps<typeof Input>> = {}) => (
    <FormField id={`c10-${key}`} label={t(key as never)} error={err(key)}>
      <Input
        id={`c10-${key}`}
        className="h-11"
        aria-invalid={!!errors[key]}
        value={form[key] as string}
        onChange={(e) => set(key, e.target.value as never)}
        {...extra}
      />
    </FormField>
  );
  return (
    <div data-screen="C-10" className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="font-semibold text-2xl">{t(props.editing ? "titleEdit" : "titleNew")}</h1>
      {props.duplicates ? (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
          <p className="font-medium">{t("duplicatePhone")}</p>
          <ul className="flex flex-wrap gap-3">
            {props.duplicates.ids.map((id) => (
              <li key={id}>
                <Link href={`/console/customers/${id}`} className="underline">
                  {t("openExisting")}
                </Link>
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" className="h-11 self-start" onClick={props.onContinue}>
            {t("continue")}
          </Button>
        </div>
      ) : null}

      <Section title={t("sectionMain")}>
        {textField("firstName", { maxLength: 60, required: true })}
        {textField("lastName", { maxLength: 60 })}
        {textField("nickname", { maxLength: 30 })}
        <FormField id="c10-phone" label={t("phone")} error={err("phone")}>
          <PhoneInput id="c10-phone" value={form.phone || null} onValueChange={(v) => set("phone", v.e164 ?? (v.error ? "x" : ""))} />
        </FormField>
        {textField("email", { type: "email", inputMode: "email", autoComplete: "email" })}
        <FormField id="c10-birthDate" label={t("birthDate")}>
          <ThaiDatePicker
            id="c10-birthDate"
            value={form.birthDate}
            placeholder={t("pickDate")}
            onValueChange={(v) => set("birthDate", v)}
          />
        </FormField>
      </Section>

      <Section title={t("sectionAddress")}>
        {textField("addressLine")}
        {/* no postal-code dataset in 10 reference data — free text for now (Q-1014) */}
        {textField("subdistrict")}
        {textField("district")}
        <FormField id="c10-province" label={t("province")}>
          <select id="c10-province" className={selectClass} value={form.province} onChange={(e) => set("province", e.target.value)}>
            <option value="">{t("chooseProvince")}</option>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </FormField>
        {textField("postalCode", { inputMode: "numeric", maxLength: 5 })}
      </Section>

      <Section title={t("sectionShop")}>
        <FormField id="c10-sourceChannel" label={t("sourceChannel")}>
          <EnumSelect
            id="c10-sourceChannel"
            enumName="booking_channel"
            value={form.sourceChannel}
            disabled={props.editing}
            onValueChange={(v) => v && set("sourceChannel", v)}
          />
        </FormField>
        {textField("referralNote", { disabled: props.editing })}
        {textField("emergencyContactName")}
        <FormField id="c10-emergencyContactPhone" label={t("emergencyContactPhone")} error={err("emergencyContactPhone")}>
          <PhoneInput
            id="c10-emergencyContactPhone"
            value={form.emergencyContactPhone || null}
            onValueChange={(v) => set("emergencyContactPhone", v.e164 ?? (v.error ? "x" : ""))}
          />
        </FormField>
        <FormField id="c10-photoConsent" label={t("photoConsent")}>
          <div id="c10-photoConsent" role="radiogroup" className="flex flex-wrap gap-2">
            {PHOTO_CONSENTS.map((v) => (
              <Button
                key={v}
                type="button"
                role="radio"
                aria-checked={form.photoConsent === v}
                variant={form.photoConsent === v ? "default" : "outline"}
                className="h-11"
                onClick={() => set("photoConsent", v)}
              >
                {enumLabel("photo_consent", v)}
              </Button>
            ))}
          </div>
        </FormField>
        <label htmlFor="c10-depositExempt" className="flex min-h-11 items-center justify-between gap-3">
          <span className="font-medium text-sm">{t("depositExempt")}</span>
          <Switch
            id="c10-depositExempt"
            checked={form.depositExempt}
            disabled={!props.isOwner}
            onCheckedChange={(v) => set("depositExempt", v)}
          />
        </label>
        <FormField id="c10-internalNote" label={t("internalNote")} error={err("internalNote")}>
          <Textarea
            id="c10-internalNote"
            maxLength={2000}
            value={form.internalNote}
            onChange={(e) => set("internalNote", e.target.value)}
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
