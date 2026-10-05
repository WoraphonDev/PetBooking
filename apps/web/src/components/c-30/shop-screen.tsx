"use client";
import { BranchGetResponse } from "@app/contracts/endpoints/branch.get";
import { BranchUpdateResponse } from "@app/contracts/endpoints/branch.update";
import { useTimeZone, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "../../lib/api";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { PROVINCES } from "../c-10/logic";
import { FormField, PhoneInput } from "../shared/form";
import { PhotoUploader, staffTicket } from "../shared/upload";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { bookingUrl, formFrom, receiptExample, type ShopErrors, type ShopForm, updateBody } from "./logic";

type T = ReturnType<typeof useTranslations<"C-30">>;

/** 06#scr-C-30 — owner edits what customers see about the shop. */
export function ShopScreen() {
  const t = useTranslations("C-30");
  const common = useTranslations("common");
  const timezone = useTimeZone() ?? "Asia/Bangkok";
  const branch = useApiQuery("branch.get", { response: BranchGetResponse });
  const save = useApiMutation("branch.update", { response: BranchUpdateResponse, invalidate: ["branch.get"] });
  const [draft, setDraft] = useState<ShopForm | null>(null);
  const [errors, setErrors] = useState<ShopErrors>({});
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
  const form = draft ?? formFrom(branch.data);
  return (
    <ShopFormView
      t={t}
      form={form}
      onChange={setDraft}
      errors={errors}
      slug={branch.data.bookingSlug}
      origin={typeof window === "undefined" ? "" : window.location.origin}
      example={receiptExample(form.receiptPrefix.trim().toUpperCase(), new Date().toISOString(), timezone)}
      saving={save.isPending}
      onSave={async () => {
        const { body, errors: found } = updateBody(form);
        setErrors(found);
        if (!body) return;
        await save.mutateAsync({ body });
        setDraft(null);
        toast.success(t("saved"));
      }}
    />
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

export function ShopFormView(props: {
  t: T;
  form: ShopForm;
  onChange: (f: ShopForm) => void;
  errors: ShopErrors;
  slug: string;
  origin: string;
  example: string | null;
  saving: boolean;
  onSave: () => void;
}) {
  const { t, form, errors } = props;
  const set = <K extends keyof ShopForm>(k: K, v: ShopForm[K]) => props.onChange({ ...form, [k]: v });
  const err = (k: keyof ShopForm) => (errors[k] ? t("invalid") : undefined);
  const field = (k: keyof ShopForm, label: string, extra: React.ComponentProps<typeof Input> = {}) => (
    <FormField id={`c30-${k}`} label={label} error={err(k)}>
      <Input id={`c30-${k}`} className="h-11" value={form[k] as string} onChange={(e) => set(k, e.target.value as never)} {...extra} />
    </FormField>
  );
  const link = props.origin ? bookingUrl(props.origin, props.slug) : `/b/${props.slug}`;
  return (
    <div data-screen="C-30" className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>
      <Section title={t("sectionShop")}>
        {field("name", t("name"), { maxLength: 80 })}
        <FormField id="c30-logo" label={t("logo")} error={err("logo")}>
          <PhotoUploader
            kind="logo"
            requestTicket={staffTicket}
            value={form.logo ? [form.logo] : []}
            onChange={(next) => set("logo", next[0] ?? null)}
            labels={{ camera: t("camera"), album: t("album"), uploading: t("uploading") }}
          />
        </FormField>
        <FormField id="c30-phone" label={t("phone")} error={err("phone")}>
          <PhoneInput id="c30-phone" value={form.phone || null} onValueChange={(v) => set("phone", v.e164 ?? (v.error ? "x" : ""))} />
        </FormField>
        {field("facebookUrl", t("facebook"), { type: "url", inputMode: "url" })}
        {field("instagramUrl", t("instagram"), { type: "url", inputMode: "url" })}
        <FormField id="c30-link" label={t("bookingLink")}>
          <div className="flex gap-2">
            <Input id="c30-link" readOnly className="h-11 font-mono text-xs" value={link} />
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => void navigator.clipboard.writeText(link).then(() => toast.success(t("copied")))}
            >
              {t("copy")}
            </Button>
          </div>
        </FormField>
      </Section>
      <Section title={t("sectionAddress")}>
        {field("addressLine", t("addressLine"), { maxLength: 200 })}
        {/* no postal-code dataset in 10 reference data — free text (same as C-10, Q-1014) */}
        {field("subdistrict", t("subdistrict"))}
        {field("district", t("district"))}
        <FormField id="c30-province" label={t("province")} error={err("province")}>
          <select
            id="c30-province"
            className="h-11 rounded-lg border border-input bg-transparent px-3 text-sm"
            value={form.province}
            onChange={(e) => set("province", e.target.value)}
          >
            <option value="">{t("chooseProvince")}</option>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </FormField>
        {field("postalCode", t("postalCode"), { inputMode: "numeric", maxLength: 5 })}
        <FormField id="c30-location" label={t("location")} error={err("latitude") ?? err("longitude")}>
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label={t("latitude")}
              placeholder={t("latitude")}
              className="h-11 w-36"
              inputMode="decimal"
              value={form.latitude}
              onChange={(e) => set("latitude", e.target.value)}
            />
            <Input
              aria-label={t("longitude")}
              placeholder={t("longitude")}
              className="h-11 w-36"
              inputMode="decimal"
              value={form.longitude}
              onChange={(e) => set("longitude", e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() =>
                navigator.geolocation?.getCurrentPosition((pos) =>
                  props.onChange({ ...form, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }),
                )
              }
            >
              {t("useLocation")}
            </Button>
          </div>
        </FormField>
      </Section>
      <Section title={t("sectionReceipt")}>
        {field("receiptPrefix", t("receiptPrefix"), { maxLength: 3, className: "h-11 uppercase" })}
        <div data-field="example" className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t("example")}</span>
          <span className="font-mono">{props.example ?? "—"}</span>
        </div>
      </Section>
      <div className="flex justify-end">
        <Button type="button" className="h-11" disabled={props.saving} onClick={props.onSave}>
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
