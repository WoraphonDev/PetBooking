"use client";

import { LiffRegisterRequest, LiffRegisterResponse } from "@app/contracts/endpoints/liff.register";
import type { LiffSessionResponse } from "@app/contracts/endpoints/liff.session";
import { PublicBranchResponse } from "@app/contracts/endpoints/public.branch";
import { ERROR_MESSAGE_TH } from "@app/contracts/errors";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { liffSignIn } from "@/lib/liff";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { type FieldErrors, FormField, PhoneInput, validateForm } from "../shared/form";
import { routeFor } from "../shell-liff/navigation";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { Switch } from "../ui/switch";

type Shop = PublicBranchResponse;
type Session = LiffSessionResponse;
export type Draft = {
  firstName: string;
  lastName: string;
  nickname: string;
  phone: string | null;
  phoneError: boolean;
  privacy: boolean;
  terms: boolean;
  photoConsent: boolean;
};

/** ชื่อ is prefilled from the LINE name (cut to the 60-character limit) */
export const draftOf = (session: Session): Draft => ({
  firstName: (session.profile.displayName ?? "").trim().slice(0, 60),
  lastName: "",
  nickname: "",
  phone: null,
  phoneError: false,
  privacy: false,
  terms: false,
  photoConsent: false,
});

/** liff.register body: the accepted documents are the latest versions from liff.session; empty optional names are left out */
export function registerBody(session: Session, draft: Draft) {
  return {
    firstName: draft.firstName,
    ...(draft.lastName.trim() ? { lastName: draft.lastName } : {}),
    ...(draft.nickname.trim() ? { nickname: draft.nickname } : {}),
    phone: draft.phone ?? "",
    privacyVersion: session.legalVersions.privacy,
    termsVersion: session.legalVersions.terms,
    photoConsent: draft.photoConsent,
  } satisfies LiffRegisterRequest;
}

/** A full load of L-02, so the LIFF guard reads the new customer session. */
export const goHome = (branchSlug: string) => window.location.replace(routeFor("L-02", branchSlug));

export function LinkPendingNotice() {
  const t = useTranslations("L-01");
  return (
    <p role="status" className="rounded-lg border p-4 text-center">
      {t("linkPending")}
    </p>
  );
}

export function RegisterForm({ shop, session, branchSlug }: { shop: Shop; session: Session; branchSlug: string }) {
  const t = useTranslations("L-01");
  const [draft, setDraft] = useState<Draft>(() => draftOf(session));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [linkPending, setLinkPending] = useState(false);
  const register = useApiMutation("liff.register", { response: LiffRegisterResponse });
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  if (linkPending) return <LinkPendingNotice />;
  return (
    <form
      className="grid gap-6"
      onSubmit={async (event) => {
        event.preventDefault();
        if (register.isPending) return;
        const checked = validateForm(LiffRegisterRequest, registerBody(session, draft));
        const fieldErrors: FieldErrors = { ...checked.errors };
        if (!draft.phone) fieldErrors.phone = t("required");
        if (draft.phoneError) fieldErrors.phone = ERROR_MESSAGE_TH.INVALID_PHONE;
        if (!draft.privacy) fieldErrors.privacy = t("mustAccept");
        if (!draft.terms) fieldErrors.terms = t("mustAccept");
        setErrors(fieldErrors);
        if (!checked.success || Object.keys(fieldErrors).length) return;
        try {
          const result = await register.mutateAsync({ params: { branchSlug }, body: checked.data });
          if (result.linkPending) setLinkPending(true);
          else goHome(branchSlug);
        } catch (error) {
          toast.error(errorMessage(error));
        }
      }}
    >
      <section className="grid justify-items-center gap-2 text-center">
        {shop.logoUrl ? (
          // biome-ignore lint/performance/noImgElement: signed storage URL, not a static asset
          <img src={shop.logoUrl} alt="" width={64} height={64} className="size-16 rounded-full object-cover" />
        ) : null}
        <h1 className="text-xl font-semibold">
          <span className="sr-only">{t("shopName")}: </span>
          {t("welcome", { shop: shop.name })}
        </h1>
        <div className="flex items-center gap-2">
          {session.profile.pictureUrl ? (
            // biome-ignore lint/performance/noImgElement: LINE profile picture URL
            <img src={session.profile.pictureUrl} alt="" width={32} height={32} className="size-8 rounded-full object-cover" />
          ) : null}
          <span>
            <span className="sr-only">{t("lineName")}: </span>
            {session.profile.displayName}
          </span>
        </div>
      </section>

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
          <PhoneInput id="phone" required value={draft.phone} onValueChange={(v) => set({ phone: v.e164, phoneError: v.error !== null })} />
        </FormField>
      </section>

      <section className="grid gap-2">
        <h2 className="font-semibold">{t("sectionConsent")}</h2>
        <div className="grid gap-1">
          <label htmlFor="privacy" className="flex min-h-11 items-center gap-3">
            <Checkbox id="privacy" checked={draft.privacy} onCheckedChange={(on) => set({ privacy: on === true })} />
            <span>{t("privacy")}</span>
          </label>
          <a href="/legal/privacy" target="_blank" rel="noreferrer" className="ms-7 text-sm underline">
            {t("readPrivacy")}
          </a>
          {errors.privacy ? <p className="text-sm text-destructive">{errors.privacy}</p> : null}
        </div>
        <div className="grid gap-1">
          <label htmlFor="terms" className="flex min-h-11 items-center gap-3">
            <Checkbox id="terms" checked={draft.terms} onCheckedChange={(on) => set({ terms: on === true })} />
            <span>{t("terms")}</span>
          </label>
          {errors.terms ? <p className="text-sm text-destructive">{errors.terms}</p> : null}
        </div>
        <label htmlFor="photoConsent" className="flex min-h-11 items-center justify-between gap-4">
          <span>{t("photoConsent")}</span>
          <Switch id="photoConsent" checked={draft.photoConsent} onCheckedChange={(on) => set({ photoConsent: on })} />
        </label>
      </section>

      <Button type="submit" className="h-11" disabled={register.isPending}>
        {t("submit")}
      </Button>
    </form>
  );
}

/** liff.session again (ID token → LiffSession): the LINE name / picture and the latest legal versions for this form. */
function useLiffSession(branchSlug: string, liffId: string | null | undefined, fake: boolean) {
  const [state, setState] = useState<{ session: Session | null; error: string | null }>({ session: null, error: null });
  useEffect(() => {
    if (liffId === undefined || (!liffId && !fake)) return;
    let cancelled = false;
    liffSignIn({ branchSlug, liffId: liffId ?? "", fake, href: window.location.href })
      .then((session) => {
        if (session && !cancelled) setState({ session, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ session: null, error: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [branchSlug, liffId, fake]);
  return state;
}

export function RegisterView({ shop, session, branchSlug }: { shop: Shop; session: Session; branchSlug: string }) {
  useEffect(() => {
    if (session.registered) goHome(branchSlug);
  }, [session.registered, branchSlug]);
  if (session.linkPending) return <LinkPendingNotice />;
  if (session.registered) return null;
  return <RegisterForm shop={shop} session={session} branchSlug={branchSlug} />;
}

export function RegisterScreen({ branchSlug, fake }: { branchSlug: string; fake: boolean }) {
  const t = useTranslations("L-01");
  // liff.shop needs a registered customer (NOT_REGISTERED); public.branch is the same ShopPublic (Q-1050)
  const shop = useApiQuery("public.branch", { params: { bookingSlug: branchSlug }, response: PublicBranchResponse });
  const { session, error } = useLiffSession(branchSlug, shop.data?.liffId, fake);
  if (shop.isError || error)
    return (
      <div role="alert" className="grid justify-items-start gap-2 p-4">
        <p>{error ?? errorMessage(shop.error)}</p>
        <Button type="button" variant="outline" onClick={() => window.location.reload()}>
          {t("retry")}
        </Button>
      </div>
    );
  if (shop.isPending || !session)
    return (
      <div className="grid gap-3 p-4" aria-busy="true">
        <span className="sr-only">{t("loading")}</span>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  return (
    <div className="p-4">
      <RegisterView shop={shop.data} session={session} branchSlug={branchSlug} />
    </div>
  );
}
