"use client";

import { coatTypeValues, petSexValues, speciesValues } from "@app/contracts/enums";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { enumLabel } from "@/lib/enum-label";
import { type FieldErrors, FormField, ThaiDatePicker, validateForm, WeightInput } from "../shared/form";
import { customerTicket, PhotoUploader, type UploadedPhoto } from "../shared/upload";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { breedOptions, type PetForm, PetFormSchema, petBody } from "./logic";

type Body = ReturnType<typeof petBody>;

/** choice chips (การ์ดเลือก / segmented) — one value of a small enum */
function Choice<V extends string>({
  values,
  value,
  label,
  onChange,
  name,
}: {
  values: readonly V[];
  value: V | null;
  label: (v: V) => string;
  onChange: (v: V) => void;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
      {values.map((v) => (
        <Button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          variant={value === v ? "default" : "outline"}
          className="h-11"
          onClick={() => onChange(v)}
        >
          {label(v)}
        </Button>
      ))}
    </div>
  );
}

/** ฟอร์มน้อง: validates with the API schema, then hands the body to liff.createPet / liff.updatePet. */
export function PetFormView({
  branchSlug,
  initial,
  photoUrl,
  today,
  pending,
  onSubmit,
}: {
  branchSlug: string;
  initial: PetForm;
  photoUrl: string | null;
  today: string;
  pending: boolean;
  onSubmit: (body: Body) => Promise<void>;
}) {
  const t = useTranslations("L-03");
  const [f, setForm] = useState<PetForm>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [photo, setPhoto] = useState<UploadedPhoto[]>(photoUrl ? [{ fileId: "", url: photoUrl }] : []);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<PetForm>) => setForm((x) => ({ ...x, ...patch }));
  const breeds = f.species ? breedOptions(f.species) : [];
  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending || busy) return;
        const body = petBody(f);
        const checked = validateForm(PetFormSchema, body);
        const extra: FieldErrors = f.species === "other" && !f.speciesOther.trim() ? { speciesOther: t("speciesOther") } : {};
        setErrors({ ...checked.errors, ...extra });
        if (!checked.success || Object.keys(extra).length) return;
        await onSubmit(body);
      }}
    >
      <FormField id="photo" label={t("photo")}>
        <PhotoUploader
          kind="pet_profile"
          requestTicket={customerTicket(branchSlug)}
          value={photo}
          onChange={(next) => {
            setPhoto(next);
            set({ profileFileId: next[0]?.fileId || null });
          }}
          onBusyChange={setBusy}
          labels={{ camera: t("camera"), album: t("album"), uploading: t("uploading") }}
        />
      </FormField>
      <FormField id="name" label={t("name")} error={errors.name}>
        <Input id="name" className="h-11" required value={f.name} onChange={(e) => set({ name: e.target.value })} />
      </FormField>
      <FormField id="species" label={t("species")} error={errors.species}>
        <Choice
          name={t("species")}
          values={speciesValues}
          value={f.species}
          label={(v) => enumLabel("species", v)}
          onChange={(species) => set({ species })}
        />
      </FormField>
      {f.species === "other" ? (
        <FormField id="speciesOther" label={t("speciesOther")} error={errors.speciesOther}>
          <Input id="speciesOther" className="h-11" value={f.speciesOther} onChange={(e) => set({ speciesOther: e.target.value })} />
        </FormField>
      ) : null}
      <FormField id="breed" label={t("breed")} error={errors.breed}>
        <Input id="breed" className="h-11" list="breed-options" value={f.breed} onChange={(e) => set({ breed: e.target.value })} />
        <datalist id="breed-options">
          {breeds.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </FormField>
      <FormField id="sex" label={t("sex")} error={errors.sex}>
        <Choice
          name={t("sex")}
          values={petSexValues}
          value={f.sex}
          label={(v) => enumLabel("pet_sex", v)}
          onChange={(sex) => set({ sex })}
        />
      </FormField>
      <FormField id="birthDate" label={t("birthDate")} error={errors.birthDate}>
        {f.birthUnknown ? null : (
          <ThaiDatePicker
            id="birthDate"
            value={f.birthDate}
            max={today}
            placeholder={t("pickDate")}
            onValueChange={(birthDate) => set({ birthDate })}
          />
        )}
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={f.birthUnknown} onChange={(e) => set({ birthUnknown: e.target.checked, birthDate: null })} />
          {t("birthUnknown")}
        </label>
      </FormField>
      {f.birthUnknown ? (
        <FormField id="ageYears" label={t("ageEstimate")} error={errors.ageEstimateMonths}>
          <div className="flex items-center gap-2">
            <Input
              id="ageYears"
              inputMode="numeric"
              className="h-11 w-20"
              value={f.ageYears}
              onChange={(e) => set({ ageYears: e.target.value.replace(/\D/g, "") })}
            />
            <span>{t("years")}</span>
            <Input
              aria-label={t("months")}
              inputMode="numeric"
              className="h-11 w-20"
              value={f.ageMonths}
              onChange={(e) => set({ ageMonths: e.target.value.replace(/\D/g, "").slice(0, 2) })}
            />
            <span>{t("months")}</span>
          </div>
        </FormField>
      ) : null}
      <FormField id="neutered" label={t("neutered")} error={errors.neutered}>
        <Choice
          name={t("neutered")}
          values={["yes", "no", "unknown"] as const}
          value={f.neutered === null ? "unknown" : f.neutered ? "yes" : "no"}
          label={(v) => t(v)}
          onChange={(v) => set({ neutered: v === "unknown" ? null : v === "yes" })}
        />
      </FormField>
      {/* Q-1043: no example photos are specified for the coat cards — text cards for now */}
      <FormField id="coatType" label={t("coatType")} error={errors.coatType}>
        <Choice
          name={t("coatType")}
          values={coatTypeValues}
          value={f.coatType}
          label={(v) => enumLabel("coat_type", v)}
          onChange={(coatType) => set({ coatType })}
        />
      </FormField>
      <FormField id="weight" label={t("weight")} error={errors.weightGrams}>
        <WeightInput id="weight" value={f.weightGrams} onValueChange={(weightGrams) => set({ weightGrams: weightGrams ?? null })} />
      </FormField>
      <Button type="submit" className="h-11" disabled={pending || busy}>
        {t("save")}
      </Button>
    </form>
  );
}
