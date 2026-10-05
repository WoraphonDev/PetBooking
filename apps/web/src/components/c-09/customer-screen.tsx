"use client";
import type { CustomerDetail } from "@app/contracts/dto/customer-detail";
import type { PetSummary } from "@app/contracts/dto/pet-summary";
import { AuthMeResponse } from "@app/contracts/endpoints/auth.me";
import { CustomersBlacklistResponse } from "@app/contracts/endpoints/customers.blacklist";
import { CustomersCreditResponse } from "@app/contracts/endpoints/customers.credit";
import { CustomersGetResponse } from "@app/contracts/endpoints/customers.get";
import { CustomersReliabilityOverrideResponse } from "@app/contracts/endpoints/customers.reliabilityOverride";
import { PetsCreateResponse } from "@app/contracts/endpoints/pets.create";
import { RefundsCreateResponse } from "@app/contracts/endpoints/refunds.create";
import { coatTypeValues, petSexValues, speciesValues } from "@app/contracts/enums";
import { toLocalDate } from "@app/domain/time/local-time";
import { cn } from "cn";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTimeZone, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { formatPhone, formatTHB, formatThaiDate, formatWeight } from "../../lib/format";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { EnumSelect, FormField, ThaiDatePicker } from "../shared/form";
import { PhotoUploader, staffTicket, type UploadedPhoto } from "../shared/upload";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { CustomerActionDialog, CustomerActionsBar } from "./actions";
import { type CustomerAction, customerActions } from "./actions-logic";
import { breedsFor, emptyPet, type PetErrors, type PetForm, petBody, validatePet } from "./pet-form";

type T = ReturnType<typeof useTranslations<"C-09">>;
/** timeline / packages endpoints and owner actions come with later tasks (card step 2); packages use customers.get */
export const TABS = ["info", "pets", "packages", "credit"] as const;
export type Tab = (typeof TABS)[number];
const TAB_LABEL = { info: "tabInfo", pets: "tabPets", packages: "tabPackages", credit: "tabCredit" } as const;
const VACCINE_KEY = { ok: "vaccineOk", warning: "vaccineWarning", missing: "vaccineMissing" } as const;

/** R-12 months → "2 ปี 6 เดือน" */
export function ageLabel(t: T, months: number): string {
  const [y, m] = [Math.floor(months / 12), months % 12];
  return y > 0 ? t("age", { y, m }) : t("ageMonths", { m });
}

export const parseTab = (value: string | null): Tab => ((TABS as readonly string[]).includes(value ?? "") ? (value as Tab) : "info");

/** 06#scr-C-09 — one customer: head, info / pets / packages / credit tabs, add a pet; blacklist / level / credit / refund. */
export function CustomerScreen({ customerId }: { customerId: string }) {
  const t = useTranslations("C-09");
  const common = useTranslations("common");
  const timezone = useTimeZone() ?? "Asia/Bangkok";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = parseTab(params.get("tab"));
  const customer = useApiQuery("customers.get", { params: { customerId }, response: CustomersGetResponse });
  const createPet = useApiMutation("pets.create", { response: PetsCreateResponse, invalidate: ["customers.get", "search.quick"] });
  const [adding, setAdding] = useState(false);
  const me = useApiQuery("auth.me", { response: AuthMeResponse });
  const invalidate: ["customers.get"] = ["customers.get"];
  const blacklist = useApiMutation("customers.blacklist", { response: CustomersBlacklistResponse, invalidate });
  const override = useApiMutation("customers.reliabilityOverride", { response: CustomersReliabilityOverrideResponse, invalidate });
  const credit = useApiMutation("customers.credit", { response: CustomersCreditResponse, invalidate });
  const refund = useApiMutation("refunds.create", { response: RefundsCreateResponse, invalidate: ["customers.get", "bookings.get"] });
  const [action, setAction] = useState<CustomerAction | null>(null);

  if (customer.isPending) return <Skeleton className="m-6 h-96" />;
  if (customer.isError)
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p role="alert">{errorMessage(customer.error)}</p>
        <Button type="button" onClick={() => void customer.refetch()}>
          {common("retry")}
        </Button>
      </div>
    );
  const c = customer.data;
  const today = toLocalDate({ instant: new Date().toISOString(), timezone });
  return (
    <div data-screen="C-09" className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <CustomerHead
        t={t}
        c={c}
        onEdit={() => router.push(`/console/customers/${customerId}/edit`)}
        onBook={() => router.push(`/console/bookings/new?customerId=${customerId}`)}
        actions={<CustomerActionsBar t={t} c={c} list={customerActions(me.data?.staff.role)} onPick={setAction} />}
      />
      <div role="tablist" className="flex gap-1 border-b">
        {TABS.map((x) => (
          <button
            key={x}
            type="button"
            role="tab"
            aria-selected={tab === x}
            className={cn(
              "h-11 border-b-2 px-4 text-sm",
              tab === x ? "border-primary font-medium" : "border-transparent text-muted-foreground",
            )}
            onClick={() => router.replace(`${pathname}?tab=${x}`)}
          >
            {t(TAB_LABEL[x])}
          </button>
        ))}
      </div>
      {tab === "info" ? <InfoTab t={t} c={c} /> : null}
      {tab === "pets" ? <PetsTab t={t} pets={c.pets} onAdd={() => setAdding(true)} /> : null}
      {tab === "packages" ? <PackagesTab t={t} c={c} timezone={timezone} /> : null}
      {tab === "credit" ? <CreditTab t={t} c={c} /> : null}
      <CustomerActionDialog
        t={t}
        c={c}
        action={action}
        requestTicket={staffTicket}
        busy={blacklist.isPending || override.isPending || credit.isPending || refund.isPending}
        cancelLabel={common("cancel")}
        onClose={() => setAction(null)}
        onSubmit={async (s) => {
          const params = { customerId };
          if (s.kind === "blacklist") await blacklist.mutateAsync({ params, body: s.body });
          if (s.kind === "override") await override.mutateAsync({ params, body: s.body });
          if (s.kind === "credit") await credit.mutateAsync({ params, body: s.body });
          if (s.kind === "refund") await refund.mutateAsync({ body: s.body });
          setAction(null);
          toast.success(t("actionDone"));
        }}
      />
      <AddPetDialog
        t={t}
        open={adding}
        today={today}
        busy={createPet.isPending}
        cancelLabel={common("cancel")}
        onClose={() => setAdding(false)}
        onSubmit={async (body) => {
          await createPet.mutateAsync({ params: { customerId }, body });
          setAdding(false);
          toast.success(t("petAdded"));
        }}
      />
    </div>
  );
}

function Row({ label, children, field }: { label: string; children: ReactNode; field?: string }) {
  return (
    <div data-field={field} className="flex items-start justify-between gap-3 border-b py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export function CustomerHead({
  t,
  c,
  onEdit,
  onBook,
  actions,
}: {
  t: T;
  c: CustomerDetail;
  onEdit: () => void;
  onBook: () => void;
  /** owner / front-desk buttons (Blacklist, กำหนดระดับเอง, ปรับเครดิต, บันทึกคืนเงิน) */
  actions?: ReactNode;
}) {
  const level = c.reliabilityOverride ?? c.reliabilityLevel;
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-semibold text-2xl">
          {c.firstName} {c.lastName ?? ""}
          {c.nickname ? ` (${c.nickname})` : ""}
        </h1>
        <span
          className="rounded-full bg-muted px-2 py-0.5 text-xs"
          title={t(c.reliabilityOverride !== null ? "levelOverride" : "levelComputed")}
        >
          <span className="sr-only">{t("level")}: </span>
          {t("levelValue", { level })}
        </span>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={onEdit}>
            {t("edit")}
          </Button>
          <Button type="button" className="h-11" onClick={onBook}>
            {t("book")}
          </Button>
        </div>
      </div>
      {actions}
      {c.blacklisted ? (
        <p role="alert" data-field="blacklisted" className="rounded-lg bg-destructive px-3 py-2 text-sm text-white">
          {t("blacklisted")}
          {c.blacklistReason ? ` · ${c.blacklistReason}` : ""}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-6 text-sm">
        <span data-field="phone">
          <span className="text-muted-foreground">{t("phone")} </span>
          {c.phone ? (
            <>
              {formatPhone({ e164: c.phone })}{" "}
              <a href={`tel:${c.phone}`} className="underline">
                {t("call")}
              </a>
            </>
          ) : (
            t("none")
          )}
        </span>
        <span data-field="line" className="flex items-center gap-2">
          <span className="text-muted-foreground">{t("line")}</span>
          {c.line ? (
            <>
              {c.line.pictureUrl ? (
                // biome-ignore lint/performance/noImgElement: LINE profile picture URL
                <img src={c.line.pictureUrl} alt="" className="size-6 rounded-full" />
              ) : null}
              {c.line.displayName}
              <span className="text-muted-foreground">· {t(c.line.isFriend ? "lineFriend" : "lineNotFriend")}</span>
            </>
          ) : (
            t("lineNone")
          )}
        </span>
        {c.creditBalanceSatang !== undefined ? (
          <span data-field="credit">
            <span className="text-muted-foreground">{t("credit")} </span>
            <span className="tabular-nums">{formatTHB({ satang: c.creditBalanceSatang })}</span>
          </span>
        ) : null}
      </div>
    </section>
  );
}

export function InfoTab({ t, c }: { t: T; c: CustomerDetail }) {
  const address = [c.addressLine, c.subdistrict, c.district, c.province, c.postalCode].filter(Boolean).join(" ");
  const date = (instant: string | null) => (instant ? formatThaiDate({ date: instant.slice(0, 10) }) : t("none"));
  return (
    <section className="rounded-xl border px-4">
      <Row label={t("email")}>{c.email || t("none")}</Row>
      <Row label={t("birthDate")}>{c.birthDate ? formatThaiDate({ date: c.birthDate }) : t("none")}</Row>
      <Row label={t("address")}>{address || t("none")}</Row>
      <Row label={t("emergency")}>
        {c.emergencyContactName ?? t("none")}
        {c.emergencyContactPhone ? ` · ${formatPhone({ e164: c.emergencyContactPhone })}` : ""}
      </Row>
      <Row label={t("source")}>
        {enumLabel("booking_channel", c.sourceChannel)}
        {c.referralNote ? ` · ${c.referralNote}` : ""}
      </Row>
      <Row label={t("photoConsent")}>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{enumLabel("photo_consent", c.photoConsent)}</span>
      </Row>
      <Row label={t("depositExempt")}>{t(c.depositExempt ? "yes" : "no")}</Row>
      {c.internalNote !== undefined ? (
        <Row label={t("internalNote")} field="internalNote">
          <span className="block rounded-lg bg-yellow-50 p-2 text-left text-yellow-900">
            <span className="block text-xs">{t("internalHint")}</span>
            {c.internalNote || t("none")}
          </span>
        </Row>
      ) : null}
      <Row label={t("lateNoShow")}>
        {c.lateCancelCount12m} / {c.noShowCount12m}
      </Row>
      <Row label={t("visits")}>
        {date(c.firstVisitAt)} / {date(c.lastVisitAt)}
      </Row>
    </section>
  );
}

export function PetsTab({ t, pets, onAdd }: { t: T; pets: PetSummary[]; onAdd: () => void }) {
  return (
    <section className="flex flex-col gap-3">
      <Button type="button" variant="outline" className="h-11 self-end" onClick={onAdd}>
        {t("addPet")}
      </Button>
      {pets.length === 0 ? <p className="text-muted-foreground text-sm">{t("noPets")}</p> : null}
      <ul className="grid gap-3 md:grid-cols-2" aria-label={t("petCard")}>
        {pets.map((p) => (
          <li key={p.id}>
            <Link href={`/console/pets/${p.id}`} className="flex gap-3 rounded-xl border p-3 hover:bg-muted">
              {p.photoUrl ? (
                // biome-ignore lint/performance/noImgElement: signed storage URL, not a Next static asset
                <img src={p.photoUrl} alt="" className="size-16 rounded-lg object-cover" />
              ) : (
                <span className="size-16 rounded-lg bg-muted" />
              )}
              <span className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-base">{p.name}</span>
                <span className="text-muted-foreground">
                  {p.breed ?? enumLabel("species", p.species)}
                  {p.ageMonths !== null ? ` · ${ageLabel(t, p.ageMonths)}` : ""}
                  {p.latestWeightGrams !== null ? ` · ${formatWeight({ grams: p.latestWeightGrams })}` : ""}
                </span>
                <span className="flex flex-wrap gap-1">
                  {p.flags.map((f) => (
                    <span key={f} className="rounded bg-destructive px-1.5 text-white text-xs">
                      {enumLabel("temperament_flag", f)}
                    </span>
                  ))}
                  <span className={cn("rounded px-1.5 text-xs", p.vaccineStatus === "ok" ? "bg-emerald-100" : "bg-yellow-100")}>
                    {t(VACCINE_KEY[p.vaccineStatus])}
                  </span>
                  {p.status !== "active" ? (
                    <span className="rounded bg-muted px-1.5 text-xs">{enumLabel("pet_status", p.status)}</span>
                  ) : null}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PackagesTab({ t, c, timezone }: { t: T; c: CustomerDetail; timezone: string }) {
  const date = (instant: string) => formatThaiDate({ date: toLocalDate({ instant, timezone }) });
  if (c.activePackages.length === 0) return <p className="text-muted-foreground text-sm">{t("noPackages")}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {c.activePackages.map((p) => (
        <li key={p.id} className="rounded-xl border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold">{p.templateName}</span>
            {p.petName ? <span>{p.petName}</span> : null}
            <span>{t("packageLeft", { left: p.sessionsLeft, total: p.sessionsTotal })}</span>
            <span className="text-muted-foreground">{t("expires", { date: date(p.expiresAt) })}</span>
            <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs">{enumLabel("customer_package_status", p.status)}</span>
          </div>
          {p.redemptions.length ? (
            <div className="mt-2">
              <p className="text-muted-foreground text-xs">{t("redemptions")}</p>
              <ul className="flex flex-col gap-1">
                {p.redemptions.map((r) => (
                  <li
                    key={`${r.redeemedAt}-${r.receiptNo}`}
                    className={cn("flex flex-wrap gap-3", r.reversedAt && "text-muted-foreground line-through")}
                  >
                    <span>{date(r.redeemedAt)}</span>
                    <span>{r.petName ?? t("none")}</span>
                    <span>{r.performerName ?? t("none")}</span>
                    <span className="font-mono">{r.receiptNo ?? t("none")}</span>
                    {r.reversedAt ? <span className="no-underline">{t("reversed")}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function CreditTab({ t, c }: { t: T; c: CustomerDetail }) {
  // ประวัติ (credit_ledger) comes from customers.timeline — a later task (card step 2)
  return (
    <section className="rounded-xl border px-4">
      <Row label={t("balance")}>
        <span className="font-semibold text-lg tabular-nums">{formatTHB({ satang: c.creditBalanceSatang ?? 0 })}</span>
      </Row>
    </section>
  );
}

export function PetFields({
  t,
  form,
  onForm,
  errors,
  today,
}: {
  t: T;
  form: PetForm;
  onForm: (f: PetForm) => void;
  errors: PetErrors;
  today: string;
}) {
  const set = <K extends keyof PetForm>(k: K, v: PetForm[K]) => onForm({ ...form, [k]: v });
  const err = (k: keyof PetForm) => (errors[k] ? t("invalid") : undefined);
  const photos: UploadedPhoto[] = form.profilePhoto ? [form.profilePhoto] : [];
  const segmented = <V extends string>(
    values: readonly V[],
    value: V | null,
    label: (v: V) => string,
    onPick: (v: V) => void,
    id: string,
  ) => (
    <div id={id} role="radiogroup" className="flex flex-wrap gap-2">
      {values.map((v) => (
        <Button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          variant={value === v ? "default" : "outline"}
          className="h-11"
          onClick={() => onPick(v)}
        >
          {label(v)}
        </Button>
      ))}
    </div>
  );
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <FormField id="c09-photo" label={t("profilePhoto")}>
        <PhotoUploader
          kind="pet_profile"
          requestTicket={staffTicket}
          value={photos}
          onChange={(next) => set("profilePhoto", next[0] ?? null)}
          labels={{ camera: t("camera"), album: t("album"), uploading: t("uploading") }}
        />
      </FormField>
      <FormField id="c09-name" label={t("petName")} error={err("name")}>
        <Input id="c09-name" className="h-11" maxLength={40} value={form.name} onChange={(e) => set("name", e.target.value)} />
      </FormField>
      <FormField id="c09-species" label={t("species")}>
        {segmented(
          speciesValues,
          form.species,
          (v) => enumLabel("species", v),
          (v) => onForm({ ...form, species: v, breed: "" }),
          "c09-species",
        )}
      </FormField>
      {form.species === "other" ? (
        <FormField id="c09-speciesOther" label={t("speciesOther")} error={err("speciesOther")}>
          <Input id="c09-speciesOther" className="h-11" value={form.speciesOther} onChange={(e) => set("speciesOther", e.target.value)} />
        </FormField>
      ) : null}
      <FormField id="c09-breed" label={t("breed")} error={err("breed")}>
        <Input
          id="c09-breed"
          className="h-11"
          list="c09-breeds"
          maxLength={60}
          value={form.breed}
          onChange={(e) => set("breed", e.target.value)}
        />
        <datalist id="c09-breeds">
          {breedsFor(form.species).map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </FormField>
      <FormField id="c09-sex" label={t("sex")}>
        {segmented(
          petSexValues,
          form.sex,
          (v) => enumLabel("pet_sex", v),
          (v) => set("sex", v),
          "c09-sex",
        )}
      </FormField>
      <FormField id="c09-birthDate" label={t("petBirthDate")} error={err("birthDate")}>
        <ThaiDatePicker
          id="c09-birthDate"
          value={form.birthDate}
          max={today}
          placeholder={t("pickDate")}
          onValueChange={(v) => set("birthDate", v)}
        />
      </FormField>
      {form.birthDate ? null : (
        <FormField id="c09-ageEstimate" label={t("ageEstimate")} error={err("ageEstimateMonths")}>
          <Input
            id="c09-ageEstimate"
            className="h-11"
            inputMode="numeric"
            value={form.ageEstimateMonths}
            onChange={(e) => set("ageEstimateMonths", e.target.value)}
          />
        </FormField>
      )}
      <FormField id="c09-neutered" label={t("neutered")}>
        {segmented(
          ["yes", "no", "unknown"] as const,
          form.neutered === null ? "unknown" : form.neutered ? "yes" : "no",
          (v) => t(v === "unknown" ? "neuteredUnknown" : v),
          (v) => set("neutered", v === "unknown" ? null : v === "yes"),
          "c09-neutered",
        )}
      </FormField>
      <FormField id="c09-color" label={t("color")}>
        <Input id="c09-color" className="h-11" value={form.color} onChange={(e) => set("color", e.target.value)} />
      </FormField>
      <FormField id="c09-microchip" label={t("microchip")} error={err("microchipNo")}>
        <Input
          id="c09-microchip"
          className="h-11"
          inputMode="numeric"
          maxLength={15}
          value={form.microchipNo}
          onChange={(e) => set("microchipNo", e.target.value)}
        />
      </FormField>
      <FormField id="c09-coatType" label={t("coatType")} error={err("coatType")}>
        <EnumSelect
          id="c09-coatType"
          enumName="coat_type"
          values={coatTypeValues}
          value={form.coatType}
          placeholder=""
          onValueChange={(v) => set("coatType", v)}
        />
      </FormField>
    </div>
  );
}

export function AddPetDialog(props: {
  t: T;
  open: boolean;
  today: string;
  busy: boolean;
  cancelLabel: string;
  onClose: () => void;
  onSubmit: (body: ReturnType<typeof petBody>) => Promise<void>;
}) {
  const { t } = props;
  const [form, setForm] = useState<PetForm>(emptyPet);
  const [errors, setErrors] = useState<PetErrors>({});
  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? null : props.onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("addPet")}</DialogTitle>
        </DialogHeader>
        <PetFields t={t} form={form} onForm={setForm} errors={errors} today={props.today} />
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" onClick={props.onClose}>
            {props.cancelLabel}
          </Button>
          <Button
            type="button"
            className="h-11"
            disabled={props.busy}
            onClick={() => {
              const found = validatePet(form, props.today);
              setErrors(found);
              if (Object.keys(found).length === 0) void props.onSubmit(petBody(form)).then(() => setForm(emptyPet()));
            }}
          >
            {t("savePet")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
