"use client";
import type { DaycareSessionTypeItem } from "@app/contracts/dto/daycare-session-type-item";
import type { SizeTierItem } from "@app/contracts/dto/size-tier-item";
import { DaycareTypesListResponse } from "@app/contracts/endpoints/daycareTypes.list";
import { DaycareTypesUpsertRequest, DaycareTypesUpsertResponse } from "@app/contracts/endpoints/daycareTypes.upsert";
import { SizeTiersListResponse } from "@app/contracts/endpoints/sizeTiers.list";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { FormField, MoneyInput } from "../shared/form";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

type Row = Omit<DaycareSessionTypeItem, "id" | "capacity" | "rates"> & {
  id?: string;
  capacity: number | null;
  rates: { sizeTierId?: string; priceSatang: number | null | undefined }[];
};
export function initialDaycareRows(sessions: DaycareSessionTypeItem[], tiers: SizeTierItem[]): Row[] {
  return (["full_day", "morning", "afternoon"] as const).map((session) => {
    const existing = sessions.find((item) => item.session === session);
    const rates: Row["rates"] =
      existing?.rates.map((rate) => ({ sizeTierId: rate.sizeTierId ?? undefined, priceSatang: rate.priceSatang })) ?? [];
    for (const tier of tiers)
      if (!rates.some((rate) => rate.sizeTierId === tier.id)) rates.push({ sizeTierId: tier.id, priceSatang: null });
    if (!rates.length) rates.push({ priceSatang: null });
    return {
      id: existing?.id,
      session,
      nameTh: existing?.nameTh ?? "",
      startsAt: existing?.startsAt ?? "",
      endsAt: existing?.endsAt ?? "",
      capacity: existing?.capacity ?? null,
      status: existing?.status ?? "active",
      rates,
    };
  });
}
export function DaycareFields({ row, tiers, onChange }: { row: Row; tiers: SizeTierItem[]; onChange: (row: Row) => void }) {
  const t = useTranslations("C-40");
  const id = row.session;
  return (
    <fieldset className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
      <legend className="font-semibold">
        {t("session")}: {enumLabel("daycare_session", row.session)}
      </legend>
      <FormField id={`${id}-name`} label={t("name")}>
        <Input
          id={`${id}-name`}
          className="h-11"
          value={row.nameTh}
          onChange={(event) => onChange({ ...row, nameTh: event.target.value })}
        />
      </FormField>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend>{t("time")}</legend>
        <FormField id={`${id}-start`} label={t("start")}>
          <Input
            id={`${id}-start`}
            type="time"
            className="h-11"
            value={row.startsAt}
            onChange={(event) => onChange({ ...row, startsAt: event.target.value })}
          />
        </FormField>
        <FormField id={`${id}-end`} label={t("end")}>
          <Input
            id={`${id}-end`}
            type="time"
            className="h-11"
            value={row.endsAt}
            onChange={(event) => onChange({ ...row, endsAt: event.target.value })}
          />
        </FormField>
      </fieldset>
      <FormField id={`${id}-capacity`} label={t("capacity")}>
        <Input
          id={`${id}-capacity`}
          type="number"
          min={1}
          max={200}
          className="h-11"
          value={row.capacity ?? ""}
          onChange={(event) => onChange({ ...row, capacity: event.target.value === "" ? null : Number(event.target.value) })}
        />
      </FormField>
      <Button
        type="button"
        role="switch"
        aria-checked={row.status === "active"}
        variant={row.status === "active" ? "default" : "outline"}
        className="h-11 self-end"
        onClick={() => onChange({ ...row, status: row.status === "active" ? "archived" : "active" })}
      >
        {t("active")}
      </Button>
      {row.rates.map((rate, index) => {
        const tier = tiers.find((item) => item.id === rate.sizeTierId);
        const label = tier ? `${enumLabel("species", tier.species)} ${tier.labelTh}` : rate.sizeTierId ? "—" : t("allSizes");
        return (
          <FormField key={rate.sizeTierId ?? "default"} id={`${id}-price-${index}`} label={`${t("price")} ${label}`}>
            <MoneyInput
              id={`${id}-price-${index}`}
              value={rate.priceSatang ?? null}
              onValueChange={(priceSatang) =>
                onChange({ ...row, rates: row.rates.map((value, i) => (i === index ? { ...value, priceSatang } : value)) })
              }
            />
          </FormField>
        );
      })}
    </fieldset>
  );
}
export function DaycareEditor({ sessions, tiers }: { sessions: DaycareSessionTypeItem[]; tiers: SizeTierItem[] }) {
  const t = useTranslations("C-40");
  const [rows, setRows] = useState(() => initialDaycareRows(sessions, tiers));
  const [message, setMessage] = useState("");
  const mutation = useApiMutation("daycareTypes.upsert", {
    response: DaycareTypesUpsertResponse,
    invalidate: ["daycareTypes.list"],
    meta: { toast: false },
  });
  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (mutation.isPending) return;
        const items = rows
          .filter(
            (row) =>
              row.id ||
              row.nameTh ||
              row.startsAt ||
              row.endsAt ||
              row.capacity !== null ||
              row.rates.some((rate) => rate.priceSatang !== null),
          )
          .map((row) => ({ ...row, rates: row.rates.filter((rate) => rate.priceSatang !== null) }));
        const parsed = DaycareTypesUpsertRequest.safeParse({ items });
        if (!parsed.success) {
          setMessage(t("validation"));
          return;
        }
        setMessage("");
        try {
          await mutation.mutateAsync({ body: parsed.data });
          setMessage(t("saved"));
        } catch (error) {
          setMessage(errorMessage(error));
        }
      }}
    >
      <fieldset disabled={mutation.isPending} className="grid gap-4">
        {rows.map((row, index) => (
          <DaycareFields
            key={row.session}
            row={row}
            tiers={tiers}
            onChange={(next) => setRows((previous) => previous.map((value, i) => (i === index ? next : value)))}
          />
        ))}
      </fieldset>
      {message ? <p role="status">{message}</p> : null}
      <Button type="submit" disabled={mutation.isPending} className="h-11 justify-self-start">
        {t("save")}
      </Button>
    </form>
  );
}
export function DaycareScreen() {
  const t = useTranslations("C-40");
  const sessions = useApiQuery("daycareTypes.list", { response: DaycareTypesListResponse });
  const tiers = useApiQuery("sizeTiers.list", { response: SizeTiersListResponse });
  return (
    <section className="grid gap-6">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      {sessions.isPending || tiers.isPending ? (
        <p role="status">{t("loading")}</p>
      ) : sessions.isError || tiers.isError ? (
        <p role="alert">{errorMessage(sessions.error ?? tiers.error)}</p>
      ) : sessions.data && tiers.data ? (
        <DaycareEditor key={JSON.stringify([sessions.data, tiers.data])} sessions={sessions.data} tiers={tiers.data} />
      ) : null}
    </section>
  );
}
