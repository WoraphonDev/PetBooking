"use client";

import type { MyPet } from "@app/contracts/dto/my-pet";
import type { Quote } from "@app/contracts/dto/quote";
import { type SlotList, SlotList as SlotListSchema } from "@app/contracts/dto/slot-list";
import { LiffCreateBookingResponse } from "@app/contracts/endpoints/liff.createBooking";
import { LiffPetsResponse } from "@app/contracts/endpoints/liff.pets";
import { LiffQuoteResponse } from "@app/contracts/endpoints/liff.quote";
import { LiffShopResponse } from "@app/contracts/endpoints/liff.shop";
import { toLocalDate } from "@app/domain/time/local-time";
import { useRouter } from "next/navigation";
import { useNow, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DEFAULT_TIME_ZONE } from "@/i18n/request";
import { ApiClientError, errorMessage } from "@/lib/api";
import { formatTHB, formatThaiDate, formatTime } from "@/lib/format";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { SlotPicker, type SlotReason } from "../shared/slots";
import { routeFor } from "../shell-liff/navigation";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Skeleton } from "../ui/skeleton";
import { Textarea } from "../ui/textarea";
import {
  addonServices,
  afterCreate,
  createBody,
  dayStrip,
  mainServices,
  NOTE_MAX,
  type PetDraft,
  petPrice,
  quoteBody,
  slotsRequest,
} from "./logic";

type Shop = LiffShopResponse;
export type Flow = {
  step: 1 | 2 | 3 | 4;
  drafts: PetDraft[];
  date: string;
  /** null = 'ใครก็ได้' */
  groomerId: string | null;
  note: string;
  accepted: boolean;
  done: "confirmed" | "awaiting_approval" | null;
};
type SlotState = Record<string, SlotList | { error: string }>;

const REASON_KEY = {
  ok: "dayFull",
  closed: "reasonClosed",
  past: "reasonPast",
  beyond_horizon: "reasonBeyondHorizon",
  day_full: "dayFull",
  no_capacity: "dayFull",
} as const satisfies Record<SlotReason, string>;
const toggle = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

export const initialFlow = (days: { date: string; closed: boolean }[]): Flow => ({
  step: 1,
  drafts: [],
  date: (days.find((d) => !d.closed) ?? days[0])?.date ?? "",
  groomerId: null,
  note: "",
  accepted: false,
  done: null,
});

/** a step's "ถัดไป" is open once its required choices are made */
export function canContinue(flow: Flow): boolean {
  if (flow.step === 1) return flow.drafts.length > 0;
  if (flow.step === 2) return flow.drafts.every((d) => d.serviceIds.length > 0);
  if (flow.step === 3) return flow.drafts.every((d) => d.slot !== null);
  return flow.accepted && flow.note.length <= NOTE_MAX;
}

export function BookGroomFlow({ shop, pets, branchSlug, today }: { shop: Shop; pets: MyPet[]; branchSlug: string; today: string }) {
  const t = useTranslations("L-04");
  const router = useRouter();
  const days = dayStrip(today, shop.hours);
  const [flow, setFlow] = useState<Flow>(() => initialFlow(days));
  const [slotLists, setSlotLists] = useState<SlotState>({});
  const [groomers, setGroomers] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<Quote | undefined>(undefined);
  const set = (patch: Partial<Flow>) => setFlow((f) => ({ ...f, ...patch }));
  const setDraft = (petId: string, patch: Partial<PetDraft>) =>
    setFlow((f) => ({ ...f, drafts: f.drafts.map((d) => (d.petId === petId ? { ...d, ...patch } : d)) }));
  const petOf = (id: string) => pets.find((p) => p.id === id);
  const serviceName = (id: string) => shop.services.find((s) => s.id === id)?.nameTh ?? "";

  // liff.groomSlots per pet for the chosen day and groomer (POST, so it runs as a mutation when the inputs change)
  const slots = useApiMutation<SlotList>("liff.groomSlots", { response: SlotListSchema, meta: { toast: false } });
  const requests = flow.step === 3 ? flow.drafts.map((d) => slotsRequest(d, flow.date, flow.groomerId)) : [];
  const slotKey = JSON.stringify(requests);
  // biome-ignore lint/correctness/useExhaustiveDependencies: slotKey is the serialized requests, the only input that matters
  useEffect(() => {
    if (!requests.length) return;
    setSlotLists({});
    for (const body of requests)
      slots
        .mutateAsync({ params: { branchSlug }, body })
        .then((list) => {
          setSlotLists((m) => ({ ...m, [body.petId]: list }));
          // 'ใครก็ได้' lists show who is free that day; keep them as the groomer choices
          setGroomers((g) => ({ ...g, ...Object.fromEntries(list.slots.map((s) => [s.groomerId, s.groomerName])) }));
        })
        .catch((err: unknown) => setSlotLists((m) => ({ ...m, [body.petId]: { error: errorMessage(err) } })));
  }, [slotKey]);

  // liff.quote for the summary
  const quoteMutation = useApiMutation<Quote>("liff.quote", { response: LiffQuoteResponse });
  const quoteRequest = flow.step === 4 ? quoteBody(flow.drafts) : null;
  const quoteKey = JSON.stringify(quoteRequest);
  // biome-ignore lint/correctness/useExhaustiveDependencies: quoteKey is the serialized request, the only input that matters
  useEffect(() => {
    setQuote(undefined);
    if (quoteRequest) quoteMutation.mutate({ params: { branchSlug }, body: quoteRequest }, { onSuccess: setQuote });
  }, [quoteKey]);

  const create = useApiMutation("liff.createBooking", {
    response: LiffCreateBookingResponse,
    invalidate: ["liff.bookings"],
    meta: { toast: false },
  });
  const submit = async () => {
    if (create.isPending || !canContinue(flow)) return;
    try {
      const result = await create.mutateAsync({ params: { branchSlug }, body: createBody(flow.drafts, flow.groomerId, flow.note) });
      const next = afterCreate(result);
      if (next === "pay") router.push(routeFor("L-07", branchSlug).replace("[bookingId]", encodeURIComponent(result.booking.id)));
      else set({ done: next });
    } catch (err) {
      toast.error(errorMessage(err));
      // SLOT_TAKEN → back to step 3 to pick again
      if (err instanceof ApiClientError && err.code === "SLOT_TAKEN")
        setFlow((f) => ({ ...f, step: 3, drafts: f.drafts.map((d) => ({ ...d, slot: null })) }));
    }
  };

  if (flow.done)
    return (
      <section role="status" className="grid justify-items-center gap-2 p-6 text-center">
        <h1 className="text-xl font-semibold">{flow.done === "confirmed" ? t("doneConfirmed") : t("doneAwaitingApproval")}</h1>
      </section>
    );

  return (
    <div className="grid gap-6 p-4">
      <header className="grid gap-1">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("stepOf", { step: flow.step })}</p>
      </header>

      {flow.step === 1 ? (
        <section className="grid gap-3">
          <h2 className="font-semibold">{t("step1")}</h2>
          <p className="text-sm">{t("pickPets")}</p>
          <div className="grid grid-cols-2 gap-2">
            {pets.map((pet) => {
              const on = flow.drafts.some((d) => d.petId === pet.id);
              return (
                <Button
                  key={pet.id}
                  type="button"
                  variant={on ? "default" : "outline"}
                  aria-pressed={on}
                  className="h-auto min-h-16 flex-col gap-1 py-2"
                  onClick={() =>
                    set({
                      drafts: on
                        ? flow.drafts.filter((d) => d.petId !== pet.id)
                        : [...flow.drafts, { petId: pet.id, serviceIds: [], addonIds: [], slot: null }],
                    })
                  }
                >
                  {pet.photoUrl ? (
                    // biome-ignore lint/performance/noImgElement: signed storage URL, not a static asset
                    <img src={pet.photoUrl} alt="" width={40} height={40} className="size-10 rounded-full object-cover" />
                  ) : null}
                  <span>{pet.name}</span>
                </Button>
              );
            })}
          </div>
          {pets.length === 0 ? <p className="text-muted-foreground">{t("noPets")}</p> : null}
          {/* ขนาด (ถ้าไม่รู้น้ำหนัก): no size-tier list reaches the customer yet (Q-1051); liff.groomSlots answers WEIGHT_REQUIRED */}
        </section>
      ) : null}

      {flow.step === 2 ? (
        <section className="grid gap-4">
          <h2 className="font-semibold">{t("step2")}</h2>
          <p className="text-sm text-muted-foreground">{t("estimateNote")}</p>
          {flow.drafts.map((d) => {
            const pet = petOf(d.petId);
            if (!pet) return null;
            return (
              <div key={d.petId} className="grid gap-3">
                <h3 className="font-medium">{pet.name}</h3>
                <p className="text-sm">{t("mainService")}</p>
                <div className="grid gap-2">
                  {mainServices(shop.services, pet).map((s) => {
                    const on = d.serviceIds.includes(s.id);
                    const price = petPrice(s, pet);
                    return (
                      <Button
                        key={s.id}
                        type="button"
                        variant={on ? "default" : "outline"}
                        aria-pressed={on}
                        className="h-auto min-h-16 justify-start gap-3 py-2 text-start"
                        onClick={() => {
                          const serviceIds = toggle(d.serviceIds, s.id);
                          const allowed = addonServices(shop.services, pet, serviceIds).map((a) => a.id);
                          setDraft(d.petId, { serviceIds, addonIds: d.addonIds.filter((id) => allowed.includes(id)), slot: null });
                        }}
                      >
                        {s.photoUrl ? (
                          // biome-ignore lint/performance/noImgElement: signed storage URL, not a static asset
                          <img src={s.photoUrl} alt="" width={48} height={48} className="size-12 rounded-md object-cover" />
                        ) : null}
                        <span className="grid">
                          <span>{s.nameTh}</span>
                          <span className="text-sm">
                            {price
                              ? `${formatTHB({ satang: price.priceSatang })} · ${t("minutes", { minutes: price.durationMinutes })}`
                              : s.fromPriceSatang !== null
                                ? t("fromPrice", { price: formatTHB({ satang: s.fromPriceSatang }) })
                                : null}
                          </span>
                        </span>
                      </Button>
                    );
                  })}
                </div>
                <p className="text-sm">{t("addons")}</p>
                {addonServices(shop.services, pet, d.serviceIds).map((s) => {
                  const price = petPrice(s, pet);
                  const id = `addon-${d.petId}-${s.id}`;
                  return (
                    <label key={s.id} htmlFor={id} className="flex min-h-11 items-center gap-3">
                      <Checkbox
                        id={id}
                        checked={d.addonIds.includes(s.id)}
                        onCheckedChange={() => setDraft(d.petId, { addonIds: toggle(d.addonIds, s.id), slot: null })}
                      />
                      <span className="flex-1">{s.nameTh}</span>
                      <span className="text-sm">
                        {price
                          ? formatTHB({ satang: price.priceSatang })
                          : s.fromPriceSatang !== null
                            ? t("fromPrice", { price: formatTHB({ satang: s.fromPriceSatang }) })
                            : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            );
          })}
        </section>
      ) : null}

      {flow.step === 3 ? (
        <section className="grid gap-4">
          <h2 className="font-semibold">{t("step3")}</h2>
          <div className="grid gap-2">
            <p className="text-sm">{t("groomer")}</p>
            <div className="flex gap-2 overflow-x-auto">
              {[[null, t("anyGroomer")] as const, ...Object.entries(groomers)].map(([id, name]) => (
                <Button
                  key={id ?? "any"}
                  type="button"
                  variant={flow.groomerId === id ? "default" : "outline"}
                  aria-pressed={flow.groomerId === id}
                  className="h-auto min-h-11 shrink-0 gap-2"
                  onClick={() => set({ groomerId: id, drafts: flow.drafts.map((d) => ({ ...d, slot: null })) })}
                >
                  <span aria-hidden className="grid size-7 place-items-center rounded-full bg-muted text-xs">
                    {name.slice(0, 1)}
                  </span>
                  {name}
                </Button>
              ))}
            </div>
          </div>
          {flow.drafts.map((d) => {
            const result = slotLists[d.petId];
            const error = result && "error" in result ? result.error : null;
            return (
              <div key={d.petId} className="grid gap-2">
                <h3 className="font-medium">
                  {t("time")} · {petOf(d.petId)?.name}
                </h3>
                <SlotPicker
                  days={days.map((day) => ({ date: day.date, full: day.closed }))}
                  date={flow.date}
                  onDateChange={(date) => {
                    if (days.find((day) => day.date === date)?.closed) return;
                    set({ date, drafts: flow.drafts.map((x) => ({ ...x, slot: null })) });
                  }}
                  slotList={result && !("error" in result) ? result : undefined}
                  timezone={DEFAULT_TIME_ZONE}
                  value={d.slot}
                  onChange={(slot) => setDraft(d.petId, { slot })}
                  reasonLabel={(reason) => t(REASON_KEY[reason])}
                  fullLabel={t("closed")}
                  isLoading={!result}
                  error={error}
                />
              </div>
            );
          })}
        </section>
      ) : null}

      {flow.step === 4 ? (
        <section className="grid gap-4">
          <h2 className="font-semibold">{t("step4")}</h2>
          {!quote ? (
            <Skeleton aria-busy="true" className="h-32 w-full" />
          ) : (
            <>
              <div className="grid gap-2 rounded-lg border p-3">
                <p className="font-medium">{t("summary")}</p>
                {flow.drafts.map((d, i) => {
                  const slotList = slotLists[d.petId];
                  const slot = slotList && !("error" in slotList) ? slotList.slots.find((s) => s.startsAt === d.slot?.startsAt) : undefined;
                  const at = d.slot?.startsAt;
                  return (
                    <div key={d.petId} className="grid text-sm">
                      <span className="font-medium">{petOf(d.petId)?.name}</span>
                      <span>{[...d.serviceIds, ...d.addonIds].map(serviceName).join(", ")}</span>
                      {at ? (
                        <span>
                          {formatThaiDate({ date: toLocalDate({ instant: at, timezone: DEFAULT_TIME_ZONE }), withWeekday: true })}{" "}
                          {formatTime({ instant: at, timezone: DEFAULT_TIME_ZONE })}
                        </span>
                      ) : null}
                      <span>
                        {t("groomer")}: {slot?.groomerName ?? (flow.groomerId ? groomers[flow.groomerId] : t("anyGroomer"))}
                      </span>
                      <span>
                        {t("estimate")}: {formatTHB({ satang: quote.groom[i]?.servicesTotalSatang ?? 0 })}
                      </span>
                    </div>
                  );
                })}
                <p className="font-semibold">
                  {t("estimateTotal")}: {formatTHB({ satang: quote.estimatedTotalSatang })}
                </p>
              </div>
              <div className="grid gap-1">
                <p>
                  {t("deposit")}: <span className="font-semibold">{formatTHB({ satang: quote.depositRequiredSatang })}</span>
                </p>
                {quote.depositRequiredSatang > 0 ? <p className="text-sm text-muted-foreground">{t("depositWithin")}</p> : null}
              </div>
            </>
          )}
          <div className="grid gap-1">
            <p className="font-medium">{t("cancelPolicy")}</p>
            <p className="whitespace-pre-line rounded-lg border bg-muted/40 p-3 text-sm">{shop.policyText ?? quote?.policyText ?? ""}</p>
          </div>
          <div className="grid gap-1">
            <label htmlFor="customerNote" className="text-sm">
              {t("note")}
            </label>
            <Textarea id="customerNote" maxLength={NOTE_MAX} value={flow.note} onChange={(e) => set({ note: e.target.value })} />
          </div>
          <label htmlFor="acceptedPolicy" className="flex min-h-11 items-center gap-3">
            <Checkbox id="acceptedPolicy" checked={flow.accepted} onCheckedChange={(on) => set({ accepted: on === true })} />
            <span>{t("acceptPolicy")}</span>
          </label>
        </section>
      ) : null}

      <div className="flex gap-2">
        {flow.step > 1 ? (
          <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => set({ step: (flow.step - 1) as Flow["step"] })}>
            {t("back")}
          </Button>
        ) : null}
        {flow.step < 4 ? (
          <Button
            type="button"
            className="h-11 flex-1"
            disabled={!canContinue(flow)}
            onClick={() => set({ step: (flow.step + 1) as Flow["step"] })}
          >
            {t("next")}
          </Button>
        ) : (
          <Button type="button" className="h-11 flex-1" disabled={!canContinue(flow) || !quote || create.isPending} onClick={submit}>
            {t("confirm")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function BookGroomScreen({ branchSlug }: { branchSlug: string }) {
  const t = useTranslations("L-04");
  const now = useNow();
  const shop = useApiQuery("liff.shop", { params: { branchSlug }, response: LiffShopResponse });
  const pets = useApiQuery("liff.pets", { params: { branchSlug }, response: LiffPetsResponse });
  if (shop.isError || pets.isError)
    return (
      <div role="alert" className="grid justify-items-start gap-2 p-4">
        <p>{errorMessage(shop.error ?? pets.error)}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            shop.refetch();
            pets.refetch();
          }}
        >
          {t("retry")}
        </Button>
      </div>
    );
  if (shop.isPending || pets.isPending)
    return (
      <div className="grid gap-3 p-4" aria-busy="true">
        <span className="sr-only">{t("loading")}</span>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  return (
    <BookGroomFlow
      shop={shop.data}
      pets={pets.data}
      branchSlug={branchSlug}
      today={toLocalDate({ instant: now.toISOString(), timezone: DEFAULT_TIME_ZONE })}
    />
  );
}
