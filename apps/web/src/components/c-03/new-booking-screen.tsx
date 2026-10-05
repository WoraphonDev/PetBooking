"use client";
import type { CustomerDetail } from "@app/contracts/dto/customer-detail";
import type { CustomerListItem } from "@app/contracts/dto/customer-list-item";
import type { CustomerPackageItem } from "@app/contracts/dto/customer-package-item";
import type { PetSummary } from "@app/contracts/dto/pet-summary";
import type { Quote } from "@app/contracts/dto/quote";
import type { ServiceItem } from "@app/contracts/dto/service-item";
import type { SizeTierItem } from "@app/contracts/dto/size-tier-item";
import { type SlotList, SlotList as SlotListSchema } from "@app/contracts/dto/slot-list";
import { BookingsCreateResponse } from "@app/contracts/endpoints/bookings.create";
import { CustomersGetResponse } from "@app/contracts/endpoints/customers.get";
import { CustomersPackagesResponse } from "@app/contracts/endpoints/customers.packages";
import { QuotesCreateResponse } from "@app/contracts/endpoints/quotes.create";
import { SearchQuickResponse } from "@app/contracts/endpoints/search.quick";
import { ServicesListResponse } from "@app/contracts/endpoints/services.list";
import { SizeTiersListResponse } from "@app/contracts/endpoints/sizeTiers.list";
import { StaffUsersListResponse } from "@app/contracts/endpoints/staffUsers.list";
import { ERROR_MESSAGE_TH } from "@app/contracts/errors";
import { toLocalDate } from "@app/domain/time/local-time";
import { cn } from "cn";
import { useRouter } from "next/navigation";
import { useTimeZone, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiClientError, errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { formatPhone, formatTHB, formatTime } from "../../lib/format";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { FormField, MoneyInput, ThaiDatePicker } from "../shared/form";
import { type SlotDay, SlotPicker, type SlotReason } from "../shared/slots";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { Textarea } from "../ui/textarea";
import {
  addDays,
  addonServices,
  bookablePets,
  bookingBody,
  CHANNELS,
  type Channel,
  depositOverride,
  effectiveTierId,
  groomItems,
  mainServices,
  NOTE_MAX,
  needsSize,
  newPetDraft,
  type PetDraft,
  pendingBefore,
  petWarnings,
  redeemablePackages,
  servicePrice,
  sizeOptions,
  slotsRequest,
  toggleAddon,
  toggleMain,
} from "./logic";

type T = ReturnType<typeof useTranslations<"C-03">>;
const REASON_KEY = {
  ok: "reasonOk",
  closed: "reasonClosed",
  past: "reasonPast",
  beyond_horizon: "reasonBeyondHorizon",
  day_full: "reasonDayFull",
  no_capacity: "reasonNoCapacity",
} as const satisfies Record<SlotReason, string>;
const DEPOSIT_REASON_KEY = {
  exempt: "depositExempt",
  reliability_full_prepay: "depositReliabilityFullPrepay",
  reliability_min_30: "depositReliabilityMin30",
  policy_none: "depositPolicyNone",
  policy_fixed: "depositPolicyFixed",
  policy_percent: "depositPolicyPercent",
} as const satisfies Record<Quote["depositReason"], string>;
const selectClass = "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm";

/** 06#scr-C-03 — the shop books a walk-in / phone / chat customer (grooming tab; hotel/daycare come with M5 tasks). */
export function NewBookingScreen() {
  const t = useTranslations("C-03");
  const timezone = useTimeZone() ?? "Asia/Bangkok";
  const router = useRouter();
  const today = toLocalDate({ instant: new Date().toISOString(), timezone });

  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [drafts, setDrafts] = useState<PetDraft[]>([]);
  const [active, setActive] = useState(0);
  const [slotLists, setSlotLists] = useState<Record<string, SlotList>>({});
  const [quote, setQuote] = useState<Quote | undefined>(undefined);
  const [deposit, setDeposit] = useState<number | null>(null);
  const [depositReason, setDepositReason] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const q = search.trim();
  const results = useApiQuery("search.quick", { query: { q }, response: SearchQuickResponse }, { enabled: !customerId && q.length >= 2 });
  const detail = useApiQuery(
    "customers.get",
    { params: { customerId: customerId ?? "" }, response: CustomersGetResponse },
    { enabled: !!customerId },
  );
  const packages = useApiQuery(
    "customers.packages",
    { params: { customerId: customerId ?? "" }, response: CustomersPackagesResponse },
    { enabled: !!customerId },
  );
  const services = useApiQuery("services.list", { query: { scope: "grooming" }, response: ServicesListResponse });
  const tiers = useApiQuery("sizeTiers.list", { response: SizeTiersListResponse });
  const staff = useApiQuery("staffUsers.list", { response: StaffUsersListResponse });

  const pets = bookablePets(detail.data?.pets ?? []);
  const tierList = tiers.data ?? [];
  const serviceList = services.data ?? [];
  const groomers = (staff.data ?? []).filter((s) => s.isGroomer && (!("status" in s) || s.status === "active"));

  // availability.groomSlots for the pet being edited (POST, so it runs as a mutation whenever its inputs change)
  const slots = useApiMutation<SlotList>("availability.groomSlots", { response: SlotListSchema });
  const current = drafts[active];
  const currentPet = pets.find((p) => p.id === current?.petId);
  const slotBody = current && currentPet ? slotsRequest(current, currentPet, tierList, pendingBefore(drafts, active)) : null;
  const slotKey = JSON.stringify(slotBody);
  // biome-ignore lint/correctness/useExhaustiveDependencies: slotKey is the serialized request, the only input that matters
  useEffect(() => {
    if (!slotBody) return;
    slots.mutate({ body: slotBody }, { onSuccess: (list) => setSlotLists((m) => ({ ...m, [slotBody.petId]: list })) });
  }, [slotKey]);

  // quotes.create once every pet has services and a slot
  const groom = customerId ? groomItems(drafts, pets, tierList) : null;
  const quoteMutation = useApiMutation<Quote>("quotes.create", { response: QuotesCreateResponse });
  const quoteKey = JSON.stringify(groom);
  // biome-ignore lint/correctness/useExhaustiveDependencies: quoteKey is the serialized request, the only input that matters
  useEffect(() => {
    if (!customerId || !groom) {
      setQuote(undefined);
      return;
    }
    quoteMutation.mutate({ body: { customerId, groom } }, { onSuccess: setQuote });
  }, [customerId, quoteKey]);

  const create = useApiMutation("bookings.create", {
    response: BookingsCreateResponse,
    invalidate: ["bookings.list", "calendar.day", "dashboard.today"],
    meta: { toast: false },
  });

  const override = depositOverride(quote, deposit, depositReason);
  const reasonMissing = !!override && !override.reason;
  const body = quote ? bookingBody({ customerId, channel, groom, note, override }) : null;

  const save = async () => {
    setSubmitted(true);
    if (!body) return;
    try {
      const booking = await create.mutateAsync({ body });
      toast.success(t("created", { bookingNo: booking.bookingNo }));
      router.push(`/console/bookings/${booking.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
      // SLOT_TAKEN → back to choosing times (06#scr-C-03)
      if (err instanceof ApiClientError && err.code === "SLOT_TAKEN") {
        setDrafts((ds) => ds.map((d) => ({ ...d, slot: null, slotEndsAt: null })));
        setSlotLists({});
        setActive(0);
      }
    }
  };

  const pickCustomer = (id: string | null) => {
    setCustomerId(id);
    setDrafts([]);
    setActive(0);
    setSlotLists({});
    setDeposit(null);
    setDepositReason("");
  };
  const togglePet = (petId: string) => {
    const index = drafts.findIndex((d) => d.petId === petId);
    if (index >= 0) {
      setDrafts(drafts.filter((d) => d.petId !== petId));
      setActive(0);
    } else {
      setDrafts([...drafts, newPetDraft(petId, today)]);
      setActive(drafts.length);
    }
  };
  const updateCurrent = (next: PetDraft) => setDrafts(drafts.map((d, i) => (i === active ? next : d)));

  return (
    <div data-screen="C-03" className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>

      <CustomerSection
        t={t}
        search={search}
        onSearch={setSearch}
        results={results.data?.customers}
        searching={results.isFetching}
        customer={customerId ? detail.data : undefined}
        loadingCustomer={!!customerId && detail.isPending}
        onPick={pickCustomer}
        channel={channel}
        onChannel={setChannel}
        channelError={submitted && !channel}
      />

      {customerId && detail.data ? (
        <ServicesSection
          t={t}
          pets={pets}
          drafts={drafts}
          active={active}
          onActive={setActive}
          onTogglePet={togglePet}
          onChange={updateCurrent}
          services={serviceList}
          tiers={tierList}
          packages={packages.data ?? []}
          groomers={groomers}
          slotList={current ? slotLists[current.petId] : undefined}
          slotsLoading={slots.isPending}
          slotsError={slots.isError ? errorMessage(slots.error) : null}
          onRetrySlots={() => slotBody && slots.mutate({ body: slotBody })}
          today={today}
          timezone={timezone}
        />
      ) : null}

      {customerId && detail.data ? (
        <SummarySection
          t={t}
          drafts={drafts}
          pets={pets}
          quote={groom ? quote : undefined}
          quoteLoading={!!groom && quoteMutation.isPending}
          timezone={timezone}
          deposit={deposit}
          onDeposit={setDeposit}
          depositReason={depositReason}
          onDepositReason={setDepositReason}
          reasonError={submitted && reasonMissing ? ERROR_MESSAGE_TH.REASON_REQUIRED : undefined}
          note={note}
          onNote={setNote}
        />
      ) : null}

      <div className="flex justify-end">
        <Button type="button" size="lg" className="h-11" disabled={!body || create.isPending} onClick={save}>
          {t("submit")}
        </Button>
      </div>
    </div>
  );
}

export function CustomerSection(props: {
  t: T;
  search: string;
  onSearch: (v: string) => void;
  results: CustomerListItem[] | undefined;
  searching: boolean;
  customer: CustomerDetail | undefined;
  loadingCustomer: boolean;
  onPick: (id: string | null) => void;
  channel: Channel | null;
  onChannel: (c: Channel) => void;
  channelError: boolean;
}) {
  const { t, customer } = props;
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="font-medium text-lg">{t("sectionCustomer")}</h2>
      {customer ? (
        <div data-field="selectedCustomer" className="flex flex-wrap items-center gap-3">
          <span className="text-muted-foreground text-sm">{t("selectedCustomer")}</span>
          <span className="font-medium">
            {customer.firstName} {customer.lastName ?? ""}
          </span>
          {customer.phone ? <span>{formatPhone({ e164: customer.phone })}</span> : null}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {t("level", { level: customer.reliabilityOverride ?? customer.reliabilityLevel })}
          </span>
          {customer.blacklisted ? (
            <span className="rounded-full bg-destructive px-2 py-0.5 text-white text-xs">{t("blacklisted")}</span>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={() => props.onPick(null)}>
            {t("changeCustomer")}
          </Button>
        </div>
      ) : props.loadingCustomer ? (
        <Skeleton className="h-10 w-full" />
      ) : (
        <div className="flex flex-col gap-2">
          <FormField id="c03-search" label={t("searchCustomer")}>
            <Input
              id="c03-search"
              type="search"
              className="h-11"
              placeholder={t("searchPlaceholder")}
              value={props.search}
              onChange={(e) => props.onSearch(e.target.value)}
            />
          </FormField>
          {props.search.trim().length < 2 ? (
            <p className="text-muted-foreground text-xs">{t("searchHint")}</p>
          ) : props.searching ? (
            <Skeleton className="h-10 w-full" />
          ) : props.results?.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noCustomer")}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {props.results?.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted"
                    onClick={() => props.onPick(c.id)}
                  >
                    <span className="font-medium">
                      {c.firstName} {c.lastName ?? ""}
                    </span>
                    {c.phone ? <span className="text-sm">{formatPhone({ e164: c.phone })}</span> : null}
                    <span className="text-muted-foreground text-sm">{c.pets.map((p) => p.name).join(", ")}</span>
                    <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs">{t("level", { level: c.reliabilityLevel })}</span>
                    {c.blacklisted ? (
                      <span className="rounded-full bg-destructive px-2 py-0.5 text-white text-xs">{t("blacklisted")}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* C-10 (customer form) is a separate screen task — Q-1009 */}
          <Button type="button" variant="outline" className="h-11 self-start" disabled>
            {t("addCustomer")}
          </Button>
        </div>
      )}
      <FormField id="c03-channel" label={t("channel")} error={props.channelError ? ERROR_MESSAGE_TH.VALIDATION_FAILED : undefined}>
        <div id="c03-channel" role="radiogroup" className="flex gap-2">
          {CHANNELS.map((c) => (
            <Button
              key={c}
              type="button"
              role="radio"
              aria-checked={props.channel === c}
              variant={props.channel === c ? "default" : "outline"}
              className="h-11"
              onClick={() => props.onChannel(c)}
            >
              {enumLabel("booking_channel", c)}
            </Button>
          ))}
        </div>
      </FormField>
    </section>
  );
}

export function ServicesSection(props: {
  t: T;
  pets: PetSummary[];
  drafts: PetDraft[];
  active: number;
  onActive: (i: number) => void;
  onTogglePet: (petId: string) => void;
  onChange: (d: PetDraft) => void;
  services: ServiceItem[];
  tiers: SizeTierItem[];
  packages: CustomerPackageItem[];
  groomers: { id: string; displayName: string }[];
  slotList: SlotList | undefined;
  slotsLoading: boolean;
  slotsError: string | null;
  onRetrySlots: () => void;
  today: string;
  timezone: string;
}) {
  const { t, drafts, active } = props;
  const draft = drafts[active];
  const pet = props.pets.find((p) => p.id === draft?.petId);
  const days: SlotDay[] = draft ? Array.from({ length: 7 }, (_, i) => ({ date: addDays(draft.date, i) })) : [];
  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4">
      <h2 className="font-medium text-lg">{t("sectionServices")}</h2>
      {/* grooming only in this task; hotel / daycare tabs arrive with availability.hotel / availability.daycare */}
      <div role="tablist" className="flex gap-2">
        <Button type="button" role="tab" aria-selected className="h-11">
          {t("tabGrooming")}
        </Button>
      </div>

      <FormField id="c03-pets" label={t("pets")}>
        {props.pets.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noPets")}</p>
        ) : (
          <div id="c03-pets" className="flex flex-wrap gap-2">
            {props.pets.map((p) => {
              const index = drafts.findIndex((d) => d.petId === p.id);
              return (
                <Button
                  key={p.id}
                  type="button"
                  aria-pressed={index >= 0}
                  variant={index >= 0 ? "default" : "outline"}
                  className={cn("h-11 rounded-full", index === active && index >= 0 && "ring-2 ring-ring")}
                  onClick={() => (index >= 0 && index !== active ? props.onActive(index) : props.onTogglePet(p.id))}
                >
                  {p.name}
                </Button>
              );
            })}
          </div>
        )}
      </FormField>

      {draft && pet ? (
        <PetForm
          t={t}
          pet={pet}
          draft={draft}
          onChange={props.onChange}
          services={props.services}
          tiers={props.tiers}
          packages={props.packages}
          groomers={props.groomers}
          today={props.today}
        />
      ) : null}

      {draft && pet ? (
        <FormField id="c03-time" label={t("time")}>
          {draft.serviceIds.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("chooseServiceFirst")}</p>
          ) : (
            <SlotPicker
              days={days}
              date={draft.date}
              onDateChange={(date) => props.onChange({ ...draft, date, slot: null, slotEndsAt: null })}
              slotList={props.slotList}
              timezone={props.timezone}
              value={draft.slot}
              onChange={(slot) =>
                props.onChange({
                  ...draft,
                  slot,
                  slotEndsAt: slot
                    ? (props.slotList?.slots.find((s) => s.startsAt === slot.startsAt && s.groomerId === slot.groomerId)?.endsAt ?? null)
                    : null,
                })
              }
              reasonLabel={(reason) => t(REASON_KEY[reason])}
              fullLabel={t("full")}
              isLoading={props.slotsLoading}
              error={props.slotsError}
              onRetry={props.onRetrySlots}
            />
          )}
        </FormField>
      ) : null}
    </section>
  );
}

export function PetForm(props: {
  t: T;
  pet: PetSummary;
  draft: PetDraft;
  onChange: (d: PetDraft) => void;
  services: ServiceItem[];
  tiers: SizeTierItem[];
  packages: CustomerPackageItem[];
  groomers: { id: string; displayName: string }[];
  today: string;
}) {
  const { t, pet, draft, onChange } = props;
  const tierId = effectiveTierId(pet, props.tiers, draft);
  const mains = mainServices(props.services, pet);
  const addons = addonServices(props.services, pet, draft.serviceIds);
  const pkgs = redeemablePackages(props.packages, pet.id, new Date().toISOString());
  const price = (s: ServiceItem) => {
    const found = servicePrice(s, pet, tierId);
    return found ? formatTHB({ satang: found.priceSatang }) : t("noPrice");
  };
  return (
    <div data-pet={pet.id} className="grid gap-4 md:grid-cols-2">
      {needsSize(pet, props.tiers) ? (
        <FormField id="c03-size" label={t("size")}>
          <select
            id="c03-size"
            className={selectClass}
            value={draft.sizeTierId ?? ""}
            onChange={(e) => onChange({ ...draft, sizeTierId: e.target.value || null, slot: null, slotEndsAt: null })}
          >
            <option value="">{t("sizePlaceholder")}</option>
            {sizeOptions(pet, props.tiers).map((tier) => (
              <option key={tier.id} value={tier.id}>
                {tier.labelTh}
              </option>
            ))}
          </select>
        </FormField>
      ) : null}
      <FormField id="c03-main" label={t("mainServices")}>
        <ul id="c03-main" className="flex flex-col gap-1">
          {mains.map((s) => (
            <li key={s.id}>
              <label className="flex min-h-11 items-center gap-3 rounded-lg border px-3">
                <input
                  type="checkbox"
                  checked={draft.serviceIds.includes(s.id)}
                  onChange={() => onChange(toggleMain(draft, s.id, props.services))}
                />
                <span className="flex-1">{s.nameTh}</span>
                <span className="text-sm tabular-nums">{price(s)}</span>
              </label>
            </li>
          ))}
        </ul>
      </FormField>
      <FormField id="c03-addons" label={t("addons")}>
        <ul id="c03-addons" className="flex flex-col gap-1">
          {addons.map((s) => (
            <li key={s.id}>
              <label className="flex min-h-11 items-center gap-3 rounded-lg border px-3">
                <input type="checkbox" checked={draft.addonIds.includes(s.id)} onChange={() => onChange(toggleAddon(draft, s.id))} />
                <span className="flex-1">{s.nameTh}</span>
                <span className="text-sm tabular-nums">{price(s)}</span>
              </label>
            </li>
          ))}
        </ul>
      </FormField>
      <FormField id="c03-package" label={t("package")}>
        <select
          id="c03-package"
          className={selectClass}
          value={draft.customerPackageId ?? ""}
          onChange={(e) => onChange({ ...draft, customerPackageId: e.target.value || null })}
        >
          <option value="">{t("noPackage")}</option>
          {pkgs.map((p) => (
            <option key={p.id} value={p.id}>
              {t("packageOption", { name: p.templateName, left: p.sessionsLeft })}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id="c03-groomer" label={t("groomer")}>
        <select
          id="c03-groomer"
          className={selectClass}
          value={draft.groomerId ?? ""}
          onChange={(e) => onChange({ ...draft, groomerId: e.target.value || null, slot: null, slotEndsAt: null })}
        >
          <option value="">{t("anyGroomer")}</option>
          {props.groomers.map((g) => (
            <option key={g.id} value={g.id}>
              {g.displayName}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id="c03-date" label={t("date")}>
        <ThaiDatePicker
          id="c03-date"
          value={draft.date}
          min={props.today}
          placeholder={t("date")}
          onValueChange={(date) => date && onChange({ ...draft, date, slot: null, slotEndsAt: null })}
        />
      </FormField>
    </div>
  );
}

export function SummarySection(props: {
  t: T;
  drafts: PetDraft[];
  pets: PetSummary[];
  quote: Quote | undefined;
  quoteLoading: boolean;
  timezone: string;
  deposit: number | null;
  onDeposit: (v: number | null) => void;
  depositReason: string;
  onDepositReason: (v: string) => void;
  reasonError: string | undefined;
  note: string;
  onNote: (v: string) => void;
}) {
  const { t, quote } = props;
  const warnings = petWarnings(props.pets.filter((p) => props.drafts.some((d) => d.petId === p.id)));
  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4">
      <h2 className="font-medium text-lg">{t("sectionSummary")}</h2>
      <div data-field="lines">
        <h3 className="mb-2 font-medium text-sm">{t("lines")}</h3>
        {props.quoteLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : quote ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1">{t("linePet")}</th>
                <th className="py-1">{t("lineTime")}</th>
                <th className="py-1 text-right">{t("linePrice")}</th>
              </tr>
            </thead>
            <tbody>
              {props.drafts.map((d, i) => (
                <tr key={d.petId}>
                  <td className="py-1">{props.pets.find((p) => p.id === d.petId)?.name}</td>
                  <td className="py-1">
                    {d.slot ? formatTime({ instant: d.slot.startsAt, timezone: props.timezone }) : ""}
                    {quote.groom[i] ? `–${formatTime({ instant: quote.groom[i].endsAt, timezone: props.timezone })}` : ""}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {quote.groom[i] ? formatTHB({ satang: quote.groom[i].servicesTotalSatang }) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-muted-foreground text-sm">{t("quoteHint")}</p>
        )}
      </div>
      <div data-field="estimatedTotal" className="flex items-baseline justify-between">
        <span>{t("estimatedTotal")}</span>
        <span className="font-semibold text-3xl tabular-nums">{quote ? formatTHB({ satang: quote.estimatedTotalSatang }) : "–"}</span>
      </div>
      <div data-field="depositSuggested" className="flex items-baseline justify-between">
        <span>{t("depositSuggested")}</span>
        <span className="text-right">
          <span className="tabular-nums">{quote ? formatTHB({ satang: quote.depositRequiredSatang }) : "–"}</span>
          {quote ? <span className="block text-muted-foreground text-xs">{t(DEPOSIT_REASON_KEY[quote.depositReason])}</span> : null}
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField id="c03-deposit" label={t("depositAdjust")}>
          <MoneyInput
            id="c03-deposit"
            disabled={!quote}
            value={props.deposit ?? quote?.depositRequiredSatang ?? null}
            onValueChange={(v) => props.onDeposit(v ?? null)}
          />
        </FormField>
        <FormField id="c03-deposit-reason" label={t("depositAdjustReason")} error={props.reasonError}>
          <Input
            id="c03-deposit-reason"
            className="h-11"
            disabled={!quote}
            value={props.depositReason}
            onChange={(e) => props.onDepositReason(e.target.value)}
          />
        </FormField>
      </div>
      <FormField
        id="c03-note"
        label={t("customerNote")}
        error={props.note.length > NOTE_MAX ? ERROR_MESSAGE_TH.VALIDATION_FAILED : undefined}
      >
        <Textarea id="c03-note" maxLength={NOTE_MAX} value={props.note} onChange={(e) => props.onNote(e.target.value)} />
      </FormField>
      {warnings.length ? (
        <div data-field="warnings" role="status" className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
          <p className="font-medium">{t("warnings")}</p>
          <ul className="list-disc pl-5">
            {warnings.map((w) => (
              <li key={`${w.petName}-${w.kind}`}>
                {t(w.kind === "vaccine_missing" ? "warnVaccineMissing" : "warnVaccineWarning", { pet: w.petName })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
