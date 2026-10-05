"use client";
import type { PetDetail } from "@app/contracts/dto/pet-detail";
import type { PhotoItem } from "@app/contracts/dto/photo-item";
import { AuthMeResponse } from "@app/contracts/endpoints/auth.me";
import { PetsAddWeightResponse } from "@app/contracts/endpoints/pets.addWeight";
import { PetsGetResponse } from "@app/contracts/endpoints/pets.get";
import { PetsSetFlagsResponse } from "@app/contracts/endpoints/pets.setFlags";
import { PetsUpdateResponse } from "@app/contracts/endpoints/pets.update";
import { PetsUpdateShopProfileResponse } from "@app/contracts/endpoints/pets.updateShopProfile";
import { PhotosAddResponse } from "@app/contracts/endpoints/photos.add";
import { PhotosListResponse } from "@app/contracts/endpoints/photos.list";
import { VaccinationsCreateResponse } from "@app/contracts/endpoints/vaccinations.create";
import { VaccinationsRejectResponse } from "@app/contracts/endpoints/vaccinations.reject";
import { VaccinationsVerifyResponse } from "@app/contracts/endpoints/vaccinations.verify";
import { type PhotoKind, photoKindValues, temperamentFlagValues } from "@app/contracts/enums";
import { toLocalDate } from "@app/domain/time/local-time";
import { cn } from "cn";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTimeZone, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { formatThaiDate, formatWeight } from "../../lib/format";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { ageLabel, PetFields } from "../c-09/customer-screen";
import { type PetErrors, type PetForm, validatePet } from "../c-09/pet-form";
import { LineChart } from "../shared/chart";
import { FormField, PhoneInput, ThaiDatePicker, WeightInput } from "../shared/form";
import { StatusBadge } from "../shared/table";
import { PhotoUploader, staffTicket, type UploadedPhoto } from "../shared/upload";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { Textarea } from "../ui/textarea";
import {
  canEdit,
  defaultExpiry,
  expiryWarning,
  type FlagRow,
  flagsBody,
  parseTab,
  petFormFrom,
  profileBody,
  type ShopErrors,
  type ShopForm,
  shopBody,
  shopFormFrom,
  TABS,
  type VaccineForm,
  vaccineBody,
  vaccineOptions,
  validateShop,
} from "./logic";

type T = ReturnType<typeof useTranslations<"C-11">>;
const TAB_LABEL = {
  profile: "tabProfile",
  grooming: "tabGrooming",
  health: "tabHealth",
  vaccines: "tabVaccines",
  photos: "tabPhotos",
  weight: "tabWeight",
} as const;
const KIND_LABEL = { profile: "kindProfile", before: "kindBefore", after: "kindAfter", stay: "kindStay" } as const;
const SOURCE_LABEL = { shop: "sourceShop", customer: "sourceCustomer", import: "sourceImport" } as const;
const INVALIDATE = ["pets.get", "customers.get"] as const;

/** 06#scr-C-11 — one pet across profile / grooming / health / vaccines / photos / weight. */
export function PetScreen({ petId }: { petId: string }) {
  const t = useTranslations("C-11");
  const common = useTranslations("common");
  const timezone = useTimeZone() ?? "Asia/Bangkok";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = parseTab(params.get("tab"));
  const [kind, setKind] = useState<PhotoKind | null>(null);
  const me = useApiQuery("auth.me", { response: AuthMeResponse });
  const pet = useApiQuery("pets.get", { params: { petId }, response: PetsGetResponse });
  const photos = useApiQuery("photos.list", {
    params: { petId },
    query: { limit: 200, ...(kind ? { kind } : {}) },
    response: PhotosListResponse,
  });
  const invalidate = [...INVALIDATE];
  const update = useApiMutation("pets.update", { response: PetsUpdateResponse, invalidate });
  const shop = useApiMutation("pets.updateShopProfile", { response: PetsUpdateShopProfileResponse, invalidate });
  const flags = useApiMutation("pets.setFlags", { response: PetsSetFlagsResponse, invalidate });
  const addVaccine = useApiMutation("vaccinations.create", { response: VaccinationsCreateResponse, invalidate });
  const verify = useApiMutation("vaccinations.verify", { response: VaccinationsVerifyResponse, invalidate });
  const reject = useApiMutation("vaccinations.reject", { response: VaccinationsRejectResponse, invalidate });
  const addPhoto = useApiMutation("photos.add", { response: PhotosAddResponse, invalidate: ["photos.list"] });
  const addWeight = useApiMutation("pets.addWeight", { response: PetsAddWeightResponse, invalidate });

  if (pet.isPending) return <Skeleton className="m-6 h-96" />;
  if (pet.isError)
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p role="alert">{errorMessage(pet.error)}</p>
        <Button type="button" onClick={() => void pet.refetch()}>
          {common("retry")}
        </Button>
      </div>
    );
  const p = pet.data;
  const role = me.data?.staff.role;
  const editable = canEdit(tab, role);
  const of = role === "owner" || role === "front_desk";
  const today = toLocalDate({ instant: new Date().toISOString(), timezone });
  const saved = () => toast.success(t("saved"));
  return (
    <div data-screen="C-11" className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        {p.photoUrl ? (
          // biome-ignore lint/performance/noImgElement: signed storage URL, not a Next static asset
          <img src={p.photoUrl} alt="" className="size-14 rounded-full object-cover" />
        ) : null}
        <h1 className="font-semibold text-2xl">{p.name}</h1>
        <StatusBadge enumName="pet_status" value={p.status} />
      </div>
      <div role="tablist" className="flex flex-wrap gap-1 border-b">
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
      {tab === "profile" ? (
        <ProfileTab
          t={t}
          p={p}
          today={today}
          editable={editable}
          busy={update.isPending}
          onSave={async (form) => {
            await update.mutateAsync({ params: { petId }, body: profileBody(form) });
            saved();
          }}
        />
      ) : null}
      {tab === "grooming" || tab === "health" ? (
        <ShopTab
          key={tab}
          t={t}
          tab={tab}
          p={p}
          photos={photos.data?.items ?? []}
          editable={editable}
          busy={shop.isPending || flags.isPending}
          onSave={async (body) => {
            await shop.mutateAsync({ params: { petId }, body });
            saved();
          }}
          onSaveFlags={async (body) => {
            await flags.mutateAsync({ params: { petId }, body });
            saved();
          }}
        />
      ) : null}
      {tab === "vaccines" ? (
        <VaccinesTab
          t={t}
          p={p}
          today={today}
          canManage={of}
          busy={addVaccine.isPending || verify.isPending || reject.isPending}
          onAdd={async (body) => {
            await addVaccine.mutateAsync({ params: { petId }, body });
            saved();
          }}
          onVerify={(vaccinationId) => void verify.mutateAsync({ params: { vaccinationId }, body: {} }).then(saved)}
          onReject={(vaccinationId, reason) => void reject.mutateAsync({ params: { vaccinationId }, body: { reason } }).then(saved)}
        />
      ) : null}
      {tab === "photos" ? (
        <PhotosTab
          t={t}
          photos={photos.data?.items ?? []}
          kind={kind}
          onKind={setKind}
          timezone={timezone}
          onAdd={async (fileId, photoKind) => {
            await addPhoto.mutateAsync({ params: { petId }, body: { fileId, kind: photoKind } });
            saved();
          }}
        />
      ) : null}
      {tab === "weight" ? (
        <WeightTab
          t={t}
          p={p}
          timezone={timezone}
          busy={addWeight.isPending}
          onAdd={async (weightGrams) => {
            await addWeight.mutateAsync({ params: { petId }, body: { weightGrams } });
            saved();
          }}
        />
      ) : null}
    </div>
  );
}

function SaveBar({ t, editable, busy, onSave }: { t: T; editable: boolean; busy: boolean; onSave: () => void }) {
  return editable ? (
    <Button type="button" className="h-11 self-end" disabled={busy} onClick={onSave}>
      {t("save")}
    </Button>
  ) : null;
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export function ProfileTab(props: {
  t: T;
  p: PetDetail;
  today: string;
  editable: boolean;
  busy: boolean;
  onSave: (f: PetForm) => Promise<void>;
}) {
  const { t, p } = props;
  const [form, setForm] = useState<PetForm>(() => petFormFrom(p));
  const [errors, setErrors] = useState<PetErrors>({});
  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4">
      <fieldset disabled={!props.editable} className="contents">
        {/* same fields as C-09's add-pet dialog (06 C-11 profile tab) */}
        <PetFields t={t as never} form={form} onForm={setForm} errors={errors} today={props.today} />
      </fieldset>
      <Row label={t("status")}>{enumLabel("pet_status", p.status)}</Row>
      <Row label={t("ageCalc")}>
        {props.p.birthDate || props.p.ageEstimateMonths !== null ? ageFromDetail(t, p, props.today) : t("none")}
      </Row>
      <SaveBar
        t={t}
        editable={props.editable}
        busy={props.busy}
        onSave={() => {
          const found = validatePet(form, props.today);
          setErrors(found);
          if (Object.keys(found).length === 0) void props.onSave(form);
        }}
      />
    </section>
  );
}

/** R-12 age from the detail (birth date preferred, else the estimate) */
function ageFromDetail(t: T, p: PetDetail, today: string): string {
  if (p.birthDate) {
    const [by, bm, bd] = p.birthDate.split("-").map(Number) as [number, number, number];
    const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
    const months = (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0);
    return ageLabel(t as never, Math.max(0, months));
  }
  return ageLabel(t as never, p.ageEstimateMonths ?? 0);
}

export function ShopTab(props: {
  t: T;
  tab: "grooming" | "health";
  p: PetDetail;
  photos: PhotoItem[];
  editable: boolean;
  busy: boolean;
  onSave: (body: ReturnType<typeof shopBody>) => Promise<void>;
  onSaveFlags: (body: NonNullable<ReturnType<typeof flagsBody>>) => Promise<void>;
}) {
  const { t, p, tab } = props;
  const [form, setForm] = useState<ShopForm>(() => shopFormFrom(p));
  const [errors, setErrors] = useState<ShopErrors>({});
  const [flagRows, setFlagRows] = useState<FlagRow[]>(() => p.flags.map((f) => ({ flag: f.flag, note: f.note ?? "" })));
  const set = <K extends keyof ShopForm>(k: K, v: ShopForm[K]) => setForm({ ...form, [k]: v });
  const text = (k: keyof ShopForm, label: string, className?: string, area = false) => (
    <FormField id={`c11-${k}`} label={label}>
      {area ? (
        <Textarea
          id={`c11-${k}`}
          className={className}
          value={(form[k] as string | null) ?? ""}
          onChange={(e) => set(k, e.target.value as never)}
        />
      ) : (
        <Input
          id={`c11-${k}`}
          className={cn("h-11", className)}
          value={(form[k] as string | null) ?? ""}
          onChange={(e) => set(k, e.target.value as never)}
        />
      )}
    </FormField>
  );
  const save = () => {
    const found = validateShop(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    void props.onSave(shopBody(form, tab));
  };
  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4">
      <fieldset disabled={!props.editable} className="grid gap-4 md:grid-cols-2">
        {tab === "grooming" ? (
          <>
            {text("preferredStyle", t("preferredStyle"))}
            {text("bladeNo", t("bladeNo"))}
            {text("shampooOk", t("shampooOk"))}
            {text("shampooAvoid", t("shampooAvoid"), "text-destructive")}
            <FormField id="c11-favorite" label={t("favoriteStylePhoto")}>
              {p.shop.favoriteStylePhotoUrl ? (
                // biome-ignore lint/performance/noImgElement: signed storage URL, not a Next static asset
                <img src={p.shop.favoriteStylePhotoUrl} alt="" className="h-24 w-24 rounded object-cover" />
              ) : null}
              <select
                id="c11-favorite"
                aria-label={t("pickFromLibrary")}
                className="h-11 rounded-lg border border-input bg-transparent px-3 text-sm"
                value={form.favoriteStylePhotoId ?? ""}
                onChange={(e) => set("favoriteStylePhotoId", e.target.value || undefined)}
              >
                <option value="">{t("noChange")}</option>
                {props.photos.map((ph) => (
                  <option key={ph.id} value={ph.id}>
                    {formatThaiDate({ date: ph.takenAt.slice(0, 10) })} · {t(KIND_LABEL[ph.kind])}
                    {ph.caption ? ` · ${ph.caption}` : ""}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              id="c11-groomIntervalDays"
              label={t("groomIntervalDays")}
              error={errors.groomIntervalDays ? t("invalid") : undefined}
            >
              <Input
                id="c11-groomIntervalDays"
                className="h-11"
                inputMode="numeric"
                placeholder={t("intervalHint")}
                value={form.groomIntervalDays}
                onChange={(e) => set("groomIntervalDays", e.target.value)}
              />
            </FormField>
            <div className="md:col-span-2">
              <Row label={t("lastGroomedAt")}>
                {p.shop.lastGroomedAt ? formatThaiDate({ date: p.shop.lastGroomedAt.slice(0, 10) }) : t("none")}
              </Row>
              <Row label={t("nextGroomDue")}>
                {p.nextGroomDue ? formatThaiDate({ date: p.nextGroomDue }) : t("none")}
                <span className="block text-muted-foreground text-xs">
                  {p.shop.groomIntervalDays !== null ? t("dueFromShop", { days: p.shop.groomIntervalDays }) : t("dueAuto")}
                </span>
              </Row>
            </div>
          </>
        ) : (
          <>
            {text("allergies", t("allergies"), undefined, true)}
            {text("conditions", t("conditions"), undefined, true)}
            {text("medications", t("medications"), undefined, true)}
            {text("vetClinicName", t("vetClinicName"))}
            <FormField id="c11-vetClinicPhone" label={t("vetClinicPhone")} error={errors.vetClinicPhone ? t("invalid") : undefined}>
              <PhoneInput
                id="c11-vetClinicPhone"
                value={form.vetClinicPhone || null}
                onValueChange={(v) => set("vetClinicPhone", v.e164 ?? (v.error ? "x" : ""))}
              />
            </FormField>
            <FormField id="c11-flags" label={t("flags")}>
              <div className="flex flex-wrap gap-2">
                {temperamentFlagValues.map((f) => {
                  const on = flagRows.some((r) => r.flag === f);
                  return (
                    <Button
                      key={f}
                      type="button"
                      aria-pressed={on}
                      variant={on ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFlagRows(on ? flagRows.filter((r) => r.flag !== f) : [...flagRows, { flag: f, note: "" }])}
                    >
                      {enumLabel("temperament_flag", f)}
                    </Button>
                  );
                })}
              </div>
              {flagRows.map((r) => (
                <Input
                  key={r.flag}
                  aria-label={t("flagNote", { flag: enumLabel("temperament_flag", r.flag) })}
                  placeholder={t("flagNote", { flag: enumLabel("temperament_flag", r.flag) })}
                  className="h-11"
                  maxLength={200}
                  value={r.note}
                  onChange={(e) => setFlagRows(flagRows.map((x) => (x.flag === r.flag ? { ...x, note: e.target.value } : x)))}
                />
              ))}
            </FormField>
            {text("internalNote", `${t("internalNote")} (${t("internalHint")})`, "bg-yellow-50", true)}
            {text("sharedNote", `${t("sharedNote")} (${t("sharedHint")})`, "bg-sky-50", true)}
          </>
        )}
      </fieldset>
      <SaveBar
        t={t}
        editable={props.editable}
        busy={props.busy}
        onSave={() => {
          save();
          const body = tab === "health" ? flagsBody(flagRows) : null;
          if (body) void props.onSaveFlags(body);
        }}
      />
    </section>
  );
}

export function VaccinesTab(props: {
  t: T;
  p: PetDetail;
  today: string;
  canManage: boolean;
  busy: boolean;
  onAdd: (body: NonNullable<ReturnType<typeof vaccineBody>>) => Promise<void>;
  onVerify: (id: string) => void;
  onReject: (id: string, reason: string) => void;
}) {
  const { t, p } = props;
  const [form, setForm] = useState<VaccineForm>({ vaccineCode: "", administeredOn: null, expiresOn: null, proofFileId: null });
  const [proof, setProof] = useState<UploadedPhoto[]>([]);
  const [rejecting, setRejecting] = useState<{ id: string; reason: string } | null>(null);
  const options = vaccineOptions(p.species);
  const body = vaccineBody(form);
  const administered = (administeredOn: string | null) => {
    const months = options.find((o) => o.code === form.vaccineCode)?.defaultValidityMonths;
    setForm({
      ...form,
      administeredOn,
      expiresOn: administeredOn && months && !form.expiresOn ? defaultExpiry(administeredOn, months) : form.expiresOn,
    });
  };
  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4">
      <table className="w-full text-sm" aria-label={t("vaccines")}>
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1">{t("vaccineName")}</th>
            <th className="py-1">{t("administeredOn")}</th>
            <th className="py-1">{t("expiresOn")}</th>
            <th className="py-1">{t("vaccineStatus")}</th>
            <th className="py-1">{t("vaccineSource")}</th>
            <th className="py-1">{t("proof")}</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {p.vaccinations.map((v) => (
            <tr key={v.id} className="border-t align-top">
              <td className="py-2">{v.vaccineName}</td>
              <td className="py-2">{v.administeredOn ? formatThaiDate({ date: v.administeredOn }) : t("none")}</td>
              <td className={cn("py-2", expiryWarning(v.expiresOn, props.today) && "font-medium text-destructive")}>
                {formatThaiDate({ date: v.expiresOn })}
              </td>
              <td className="py-2">
                <StatusBadge enumName="vaccine_status" value={v.status} />
                {v.rejectReason ? <span className="block text-muted-foreground text-xs">{v.rejectReason}</span> : null}
              </td>
              <td className="py-2">{t(SOURCE_LABEL[v.source])}</td>
              <td className="py-2">
                {v.proofUrl ? (
                  <a href={v.proofUrl} target="_blank" rel="noreferrer" className="underline">
                    {t("viewProof")}
                  </a>
                ) : (
                  t("none")
                )}
              </td>
              <td className="py-2 text-right">
                {props.canManage && v.status === "pending_review" ? (
                  <span className="flex justify-end gap-1">
                    <Button type="button" size="sm" disabled={props.busy} onClick={() => props.onVerify(v.id)}>
                      {t("verify")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={props.busy}
                      onClick={() => setRejecting({ id: v.id, reason: "" })}
                    >
                      {t("reject")}
                    </Button>
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rejecting ? (
        <div className="flex items-end gap-2">
          <FormField id="c11-reject" label={t("rejectReason")}>
            <Input
              id="c11-reject"
              className="h-11"
              value={rejecting.reason}
              onChange={(e) => setRejecting({ ...rejecting, reason: e.target.value })}
            />
          </FormField>
          <Button
            type="button"
            className="h-11"
            disabled={rejecting.reason.trim().length < 3 || props.busy}
            onClick={() => {
              props.onReject(rejecting.id, rejecting.reason.trim());
              setRejecting(null);
            }}
          >
            {t("reject")}
          </Button>
        </div>
      ) : null}
      {props.canManage ? (
        <div className="grid gap-3 border-t pt-4 md:grid-cols-2">
          <FormField id="c11-vaccine" label={t("vaccine")}>
            <select
              id="c11-vaccine"
              className="h-11 rounded-lg border border-input bg-transparent px-3 text-sm"
              value={form.vaccineCode}
              onChange={(e) => setForm({ ...form, vaccineCode: e.target.value })}
            >
              <option value="">{t("chooseVaccine")}</option>
              {options.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.nameTh}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="c11-administeredOn" label={t("administeredOn")}>
            <ThaiDatePicker
              id="c11-administeredOn"
              value={form.administeredOn}
              max={props.today}
              placeholder={t("pickDate")}
              onValueChange={administered}
            />
          </FormField>
          <FormField id="c11-expiresOn" label={t("expiresOn")}>
            <ThaiDatePicker
              id="c11-expiresOn"
              value={form.expiresOn}
              placeholder={t("pickDate")}
              onValueChange={(expiresOn) => setForm({ ...form, expiresOn })}
            />
          </FormField>
          <FormField id="c11-proof" label={t("proofBook")}>
            <PhotoUploader
              kind="vaccine_proof"
              accept="image/*,application/pdf"
              requestTicket={staffTicket}
              value={proof}
              onChange={(next) => {
                setProof(next);
                setForm({ ...form, proofFileId: next[0]?.fileId ?? null });
              }}
              labels={{ camera: t("camera"), album: t("album"), uploading: t("uploading") }}
            />
          </FormField>
          <Button
            type="button"
            className="h-11 md:col-span-2 md:justify-self-end"
            disabled={!body || props.busy}
            onClick={() =>
              body &&
              void props.onAdd(body).then(() => {
                setForm({ vaccineCode: "", administeredOn: null, expiresOn: null, proofFileId: null });
                setProof([]);
              })
            }
          >
            {t("addVaccine")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export function PhotosTab(props: {
  t: T;
  photos: PhotoItem[];
  kind: PhotoKind | null;
  onKind: (k: PhotoKind | null) => void;
  timezone: string;
  onAdd: (fileId: string, kind: PhotoKind) => Promise<void>;
}) {
  const { t } = props;
  const [uploads, setUploads] = useState<UploadedPhoto[]>([]);
  const [addKind, setAddKind] = useState<"before" | "after">("after");
  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4">
      <div role="radiogroup" aria-label={t("library")} className="flex flex-wrap gap-2">
        {[null, ...photoKindValues.filter((k) => k !== "profile")].map((k) => (
          <Button
            key={k ?? "all"}
            type="button"
            role="radio"
            size="sm"
            aria-checked={props.kind === k}
            variant={props.kind === k ? "default" : "outline"}
            onClick={() => props.onKind(k)}
          >
            {t(k ? KIND_LABEL[k] : "kindAll")}
          </Button>
        ))}
      </div>
      {props.photos.length === 0 ? <p className="text-muted-foreground text-sm">{t("noPhotos")}</p> : null}
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {props.photos.map((ph) => (
          <li key={ph.id} className="flex flex-col gap-1 text-xs">
            {/* biome-ignore lint/performance/noImgElement: signed storage URL, not a Next static asset */}
            <img src={ph.url} alt={ph.caption ?? ""} className="aspect-square w-full rounded-lg object-cover" />
            <span>
              {formatThaiDate({ date: toLocalDate({ instant: ph.takenAt, timezone: props.timezone }) })} · {t(KIND_LABEL[ph.kind])}
            </span>
            {ph.caption ? <span className="text-muted-foreground">{ph.caption}</span> : null}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 border-t pt-4">
        <p className="font-medium text-sm">{t("addPhoto")}</p>
        <div role="radiogroup" aria-label={t("photoKind")} className="flex gap-2">
          {(["before", "after"] as const).map((k) => (
            <Button
              key={k}
              type="button"
              role="radio"
              size="sm"
              aria-checked={addKind === k}
              variant={addKind === k ? "default" : "outline"}
              onClick={() => setAddKind(k)}
            >
              {t(KIND_LABEL[k])}
            </Button>
          ))}
        </div>
        <PhotoUploader
          kind={addKind}
          multiple
          requestTicket={staffTicket}
          value={uploads}
          onChange={(next) => {
            // each new upload is attached to the pet right away (staff.uploadUrl → photos.add)
            const added = next.filter((n) => !uploads.some((u) => u.fileId === n.fileId));
            setUploads(next);
            for (const a of added) void props.onAdd(a.fileId, addKind);
          }}
          labels={{ camera: t("camera"), album: t("album"), uploading: t("uploading") }}
        />
      </div>
    </section>
  );
}

export function WeightTab(props: { t: T; p: PetDetail; timezone: string; busy: boolean; onAdd: (grams: number) => Promise<void> }) {
  const { t, p } = props;
  const [grams, setGrams] = useState<number | null>(null);
  const valid = grams !== null && Number.isInteger(grams) && grams >= 100 && grams <= 150_000;
  const data = [...p.weights]
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
    .map((w) => ({
      label: formatThaiDate({ date: toLocalDate({ instant: w.measuredAt, timezone: props.timezone }) }),
      value: w.weightGrams,
    }));
  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4">
      <h3 className="font-medium text-sm">{t("chart")}</h3>
      {data.length ? (
        <LineChart label={t("weightChart")} data={data} unit="weight" />
      ) : (
        <p className="text-muted-foreground text-sm">{t("noWeights")}</p>
      )}
      {p.latestWeightGrams !== null ? <p className="text-sm">{formatWeight({ grams: p.latestWeightGrams })}</p> : null}
      <div className="flex items-end gap-2">
        <FormField id="c11-weight" label={t("addWeight")} error={grams !== null && !valid ? t("invalid") : undefined}>
          <WeightInput id="c11-weight" value={grams} onValueChange={(v) => setGrams(v === undefined ? Number.NaN : v)} />
        </FormField>
        <Button
          type="button"
          className="h-11"
          disabled={!valid || props.busy}
          onClick={() => grams !== null && void props.onAdd(grams).then(() => setGrams(null))}
        >
          {t("saveWeight")}
        </Button>
      </div>
    </section>
  );
}
