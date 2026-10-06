"use client";

import type { MyPet } from "@app/contracts/dto/my-pet";
import { LiffAddVaccinationRequest, LiffAddVaccinationResponse } from "@app/contracts/endpoints/liff.addVaccination";
import { LiffCreatePetResponse } from "@app/contracts/endpoints/liff.createPet";
import { LiffPetsResponse } from "@app/contracts/endpoints/liff.pets";
import { LiffUpdatePetResponse } from "@app/contracts/endpoints/liff.updatePet";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { enumLabel } from "@/lib/enum-label";
import { formatThaiDate } from "@/lib/format";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { type FieldErrors, FormField, ThaiDatePicker, validateForm } from "../shared/form";
import { customerTicket, PhotoUploader, type UploadedPhoto } from "../shared/upload";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { emptyForm, formOf, vaccineOptions } from "./logic";
import { PetFormView } from "./pet-form";
import { useToday } from "./pets-list";

const petsHref = (branchSlug: string) => `/liff/${encodeURIComponent(branchSlug)}/pets`;

export function NewPetPage({ branchSlug }: { branchSlug: string }) {
  const t = useTranslations("L-03");
  const router = useRouter();
  const today = useToday();
  const create = useApiMutation("liff.createPet", { response: LiffCreatePetResponse, invalidate: ["liff.pets"] });
  return (
    <div className="grid gap-4 p-4">
      <h1 className="text-xl font-semibold">{t("addPet")}</h1>
      <PetFormView
        branchSlug={branchSlug}
        initial={emptyForm()}
        photoUrl={null}
        today={today}
        pending={create.isPending}
        onSubmit={async (body) => {
          try {
            const pet = await create.mutateAsync({ params: { branchSlug }, body });
            toast.success(t("saved"));
            router.replace(`${petsHref(branchSlug)}/${encodeURIComponent(pet.id)}`);
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
    </div>
  );
}

/** วัคซีน: list with status (รอร้านตรวจ / ยืนยันแล้ว / ไม่ผ่าน + เหตุผล) and the customer's add form (R-25 proof upload first). */
export function VaccinesSection({ pet, branchSlug, today }: { pet: MyPet; branchSlug: string; today: string }) {
  const t = useTranslations("L-03");
  const [vaccineCode, setVaccineCode] = useState("");
  const [expiresOn, setExpiresOn] = useState<string | null>(null);
  const [proof, setProof] = useState<UploadedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const add = useApiMutation("liff.addVaccination", { response: LiffAddVaccinationResponse, invalidate: ["liff.pets"] });
  return (
    <section className="grid gap-3">
      <h2 className="font-semibold">{t("vaccines")}</h2>
      <ul aria-label={t("vaccineList")} className="grid gap-2">
        {pet.vaccinations.map((v) => (
          <li key={v.id} className="rounded-lg border p-3 text-sm">
            <p className="font-medium">{v.vaccineName}</p>
            <p>{t("expiresOn", { date: formatThaiDate({ date: v.expiresOn }) })}</p>
            <p className={v.status === "rejected" ? "text-destructive" : "text-muted-foreground"}>
              {enumLabel("vaccine_status", v.status)}
              {v.status === "rejected" && v.rejectReason ? ` · ${v.rejectReason}` : ""}
            </p>
          </li>
        ))}
      </ul>
      <form
        className="grid gap-3 rounded-lg border p-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (add.isPending || busy) return;
          const checked = validateForm(LiffAddVaccinationRequest, {
            vaccineCode,
            expiresOn: expiresOn ?? "",
            proofFileId: proof[0]?.fileId ?? "",
          });
          setErrors(checked.errors);
          if (!checked.success) return;
          try {
            await add.mutateAsync({ params: { branchSlug, petId: pet.id }, body: checked.data });
            setVaccineCode("");
            setExpiresOn(null);
            setProof([]);
            toast.success(t("vaccineSent"));
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      >
        <FormField id="vaccineCode" label={t("addVaccine")} error={errors.vaccineCode}>
          <select
            id="vaccineCode"
            className="h-11 rounded-md border bg-background px-3"
            value={vaccineCode}
            onChange={(e) => setVaccineCode(e.target.value)}
          >
            <option value="">{t("chooseVaccine")}</option>
            {vaccineOptions(pet.species).map((o) => (
              <option key={o.code} value={o.code}>
                {o.nameTh}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="expiresOn" label={t("vaccineExpiry")} error={errors.expiresOn}>
          <ThaiDatePicker id="expiresOn" value={expiresOn} min={today} placeholder={t("pickDate")} onValueChange={setExpiresOn} />
        </FormField>
        <FormField id="proof" label={t("vaccineProof")} error={errors.proofFileId}>
          <PhotoUploader
            kind="vaccine_proof"
            accept="image/*,application/pdf"
            requestTicket={customerTicket(branchSlug)}
            value={proof}
            onChange={setProof}
            onBusyChange={setBusy}
            labels={{ camera: t("camera"), album: t("album"), uploading: t("uploading") }}
          />
        </FormField>
        <Button type="submit" className="h-11" disabled={add.isPending || busy}>
          {t("sendVaccine")}
        </Button>
      </form>
    </section>
  );
}

export function PetDetailPage({ branchSlug, petId }: { branchSlug: string; petId: string }) {
  const t = useTranslations("L-03");
  const today = useToday();
  const pets = useApiQuery("liff.pets", { params: { branchSlug }, response: LiffPetsResponse });
  const update = useApiMutation("liff.updatePet", { response: LiffUpdatePetResponse, invalidate: ["liff.pets"] });
  if (pets.isPending)
    return (
      <div className="grid gap-3 p-4" aria-busy="true">
        <span className="sr-only">{t("loading")}</span>
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  if (pets.isError)
    return (
      <div role="alert" className="grid justify-items-start gap-2 p-4">
        <p>{errorMessage(pets.error)}</p>
        <Button type="button" variant="outline" onClick={() => pets.refetch()}>
          {t("retry")}
        </Button>
      </div>
    );
  const pet = pets.data.find((p) => p.id === petId);
  if (!pet) return <p className="p-4">{t("notFound")}</p>;
  // 'รูปก่อน-หลังจากร้าน': liff.pets already returns only before/after/stay photos
  return (
    <div className="grid gap-6 p-4">
      <h1 className="text-xl font-semibold">{pet.name}</h1>
      <PetFormView
        key={pet.id}
        branchSlug={branchSlug}
        initial={formOf(pet)}
        photoUrl={pet.photoUrl}
        today={today}
        pending={update.isPending}
        onSubmit={async (body) => {
          try {
            await update.mutateAsync({ params: { branchSlug, petId: pet.id }, body });
            toast.success(t("saved"));
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
      {pet.sharedNote ? (
        <section className="grid gap-2">
          <h2 className="font-semibold">{t("shopNote")}</h2>
          <p className="rounded-lg bg-sky-50 p-3 text-sky-950 dark:bg-sky-950 dark:text-sky-50">{pet.sharedNote}</p>
        </section>
      ) : null}
      <VaccinesSection pet={pet} branchSlug={branchSlug} today={today} />
      {pet.photos.length ? (
        <section className="grid gap-2">
          <h2 className="font-semibold">{t("photos")}</h2>
          <div className="grid grid-cols-3 gap-2">
            {pet.photos.map((ph) => (
              // biome-ignore lint/performance/noImgElement: signed storage URL, not a static asset
              <img key={ph.id} src={ph.url} alt={ph.caption ?? ""} className="aspect-square w-full rounded-md object-cover" />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
