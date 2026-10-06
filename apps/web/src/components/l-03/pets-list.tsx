"use client";

import type { MyPet } from "@app/contracts/dto/my-pet";
import { LiffPetsResponse } from "@app/contracts/endpoints/liff.pets";
import { toLocalDate } from "@app/domain/time/local-time";
import Link from "next/link";
import { useNow, useTranslations } from "next-intl";
import { DEFAULT_TIME_ZONE } from "@/i18n/request";
import { errorMessage } from "@/lib/api";
import { enumLabel } from "@/lib/enum-label";
import { useApiQuery } from "@/lib/query";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { petAge, vaccineSoon } from "./logic";

export function useToday(): string {
  return toLocalDate({ instant: useNow().toISOString(), timezone: DEFAULT_TIME_ZONE });
}

export function AgeText({ pet, today }: { pet: Pick<MyPet, "birthDate" | "ageEstimateMonths">; today: string }) {
  const t = useTranslations("L-03");
  const age = petAge(pet, today);
  if (!age) return null;
  const years = Math.floor(age.months / 12);
  const text = years ? t("ageYearsMonths", { years, months: age.months % 12 }) : t("ageMonths", { months: age.months });
  return <>{age.estimate ? t("ageAbout", { age: text }) : text}</>;
}

export function PetCard({ pet, href, today }: { pet: MyPet; href: string; today: string }) {
  const t = useTranslations("L-03");
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 rounded-lg border p-3">
        {pet.photoUrl ? (
          // biome-ignore lint/performance/noImgElement: signed storage URL, not a static asset
          <img src={pet.photoUrl} alt="" width={56} height={56} className="size-14 rounded-full object-cover" />
        ) : (
          <span className="size-14 rounded-full bg-muted" aria-hidden />
        )}
        <span className="grid gap-0.5">
          <span className="font-semibold">{pet.name}</span>
          <span className="text-sm text-muted-foreground">
            {pet.breed ?? (pet.species === "other" ? pet.speciesOther : enumLabel("species", pet.species))}
            {" · "}
            <AgeText pet={pet} today={today} />
          </span>
          {vaccineSoon(pet, today) ? <span className="text-sm font-medium text-destructive">{t("vaccineSoon")}</span> : null}
        </span>
      </Link>
    </li>
  );
}

export function PetsList({ branchSlug }: { branchSlug: string }) {
  const t = useTranslations("L-03");
  const today = useToday();
  const pets = useApiQuery("liff.pets", { params: { branchSlug }, response: LiffPetsResponse });
  const base = `/liff/${encodeURIComponent(branchSlug)}/pets`;
  return (
    <div className="grid gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <Button asChild className="h-11">
          <Link href={`${base}/new`}>{t("addPet")}</Link>
        </Button>
      </div>
      {pets.isPending ? (
        <div className="grid gap-3" aria-busy="true">
          <span className="sr-only">{t("loading")}</span>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : pets.isError ? (
        <div role="alert" className="grid justify-items-start gap-2">
          <p>{errorMessage(pets.error)}</p>
          <Button type="button" variant="outline" onClick={() => pets.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : pets.data.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3">
          {pets.data.map((p) => (
            <PetCard key={p.id} pet={p} href={`${base}/${encodeURIComponent(p.id)}`} today={today} />
          ))}
        </ul>
      )}
    </div>
  );
}
