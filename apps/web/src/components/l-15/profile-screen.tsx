"use client";

import { LiffMeResponse } from "@app/contracts/endpoints/liff.me";
import { LiffUpdateMeRequest, LiffUpdateMeResponse } from "@app/contracts/endpoints/liff.updateMe";
import type { DataRequestType } from "@app/contracts/enums";
import { ERROR_MESSAGE_TH } from "@app/contracts/errors";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { formatTHB } from "@/lib/format";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { type FieldErrors, FormField, PhoneInput, validateForm } from "../shared/form";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { Switch } from "../ui/switch";

type Profile = LiffMeResponse;
type Draft = { firstName: string; lastName: string; nickname: string; phone: string | null; phoneError: boolean; photoConsent: boolean };

export const draftOf = (p: Profile): Draft => ({
  firstName: p.firstName,
  lastName: p.lastName ?? "",
  nickname: p.nickname ?? "",
  phone: p.phone,
  phoneError: false,
  photoConsent: p.photoConsent === "granted",
});

/** liff.updateMe body: the contact fields, plus photoConsent only when it changed (each change writes a consent_record) */
export function updateBody(profile: Profile, draft: Draft) {
  return {
    firstName: draft.firstName,
    lastName: draft.lastName,
    nickname: draft.nickname,
    ...(draft.phone ? { phone: draft.phone } : {}),
    ...(draft.photoConsent !== (profile.photoConsent === "granted") ? { photoConsent: draft.photoConsent } : {}),
  };
}

export function ProfileForm({ profile, branchSlug }: { profile: Profile; branchSlug: string }) {
  const t = useTranslations("L-15");
  const [draft, setDraft] = useState<Draft>(() => draftOf(profile));
  const [errors, setErrors] = useState<FieldErrors>({});
  const save = useApiMutation("liff.updateMe", { response: LiffUpdateMeResponse, invalidate: ["liff.me"] });
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <form
      className="grid gap-6"
      onSubmit={async (event) => {
        event.preventDefault();
        if (save.isPending) return;
        const checked = validateForm(LiffUpdateMeRequest, updateBody(profile, draft));
        const fieldErrors = { ...checked.errors, ...(draft.phoneError ? { phone: ERROR_MESSAGE_TH.INVALID_PHONE } : {}) };
        setErrors(fieldErrors);
        if (!checked.success || draft.phoneError) return;
        try {
          await save.mutateAsync({ params: { branchSlug }, body: checked.data });
          toast.success(t("saved"));
        } catch (error) {
          toast.error(errorMessage(error));
        }
      }}
    >
      <section className="grid gap-3">
        <h2 className="font-semibold">{t("sectionInfo")}</h2>
        <FormField id="firstName" label={t("firstName")} error={errors.firstName}>
          <Input id="firstName" className="h-11" required value={draft.firstName} onChange={(e) => set({ firstName: e.target.value })} />
        </FormField>
        <FormField id="lastName" label={t("lastName")} error={errors.lastName}>
          <Input id="lastName" className="h-11" value={draft.lastName} onChange={(e) => set({ lastName: e.target.value })} />
        </FormField>
        <FormField id="nickname" label={t("nickname")} error={errors.nickname}>
          <Input id="nickname" className="h-11" value={draft.nickname} onChange={(e) => set({ nickname: e.target.value })} />
        </FormField>
        <FormField id="phone" label={t("phone")} error={errors.phone}>
          <PhoneInput id="phone" value={profile.phone} onValueChange={(v) => set({ phone: v.e164, phoneError: v.error !== null })} />
        </FormField>
        {/* Q-1040: liff.updateMe has no email field — shown read-only */}
        <FormField id="email" label={t("email")}>
          <Input id="email" type="email" className="h-11" value={profile.email ?? ""} readOnly disabled />
        </FormField>
      </section>

      <section className="grid gap-2">
        <h2 className="font-semibold">{t("sectionCredit")}</h2>
        <p>
          {t("creditBalance")}: <span className="font-semibold">{formatTHB({ satang: profile.creditBalanceSatang })}</span>
        </p>
      </section>

      <section className="grid gap-2">
        <h2 className="font-semibold">{t("sectionConsent")}</h2>
        <label htmlFor="photoConsent" className="flex min-h-11 items-center justify-between gap-4">
          <span>{t("photoConsent")}</span>
          <Switch id="photoConsent" checked={draft.photoConsent} onCheckedChange={(on) => set({ photoConsent: on })} />
        </label>
      </section>

      <Button type="submit" className="h-11" disabled={save.isPending}>
        {t("save")}
      </Button>
    </form>
  );
}

export function DataRequestSection({ branchSlug }: { branchSlug: string }) {
  const t = useTranslations("L-15");
  const [type, setType] = useState<DataRequestType | null>(null);
  const send = useApiMutation("liff.dataRequest");
  return (
    <section className="grid gap-3">
      <h2 className="font-semibold">{t("sectionPdpa")}</h2>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-11" onClick={() => setType("access")}>
          {t("requestAccess")}
        </Button>
        <Button type="button" variant="outline" className="h-11" onClick={() => setType("delete")}>
          {t("requestDelete")}
        </Button>
      </div>
      <Dialog open={type !== null} onOpenChange={(open) => (open ? null : setType(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{type === "delete" ? t("requestDelete") : t("requestAccess")}</DialogTitle>
            <DialogDescription>{type === "delete" ? t("deleteExplain") : t("accessExplain")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={() => setType(null)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              className="h-11"
              disabled={send.isPending}
              onClick={async () => {
                if (!type || send.isPending) return;
                try {
                  await send.mutateAsync({ params: { branchSlug }, body: { type } });
                  setType(null);
                  toast.success(t("requestSent"));
                } catch (error) {
                  toast.error(errorMessage(error));
                }
              }}
            >
              {t("send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function ProfileScreen({ branchSlug }: { branchSlug: string }) {
  const t = useTranslations("L-15");
  const me = useApiQuery("liff.me", { params: { branchSlug }, response: LiffMeResponse });
  return (
    <div className="grid gap-6 p-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      {me.isPending ? (
        <div className="grid gap-3" aria-busy="true">
          <span className="sr-only">{t("loading")}</span>
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : me.isError ? (
        <div role="alert" className="grid justify-items-start gap-2">
          <p>{errorMessage(me.error)}</p>
          <Button type="button" variant="outline" onClick={() => me.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : (
        <>
          <ProfileForm profile={me.data} branchSlug={branchSlug} />
          <DataRequestSection branchSlug={branchSlug} />
        </>
      )}
    </div>
  );
}
