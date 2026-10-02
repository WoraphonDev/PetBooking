"use client";

import type { PublicHoliday } from "@app/contracts/dto/public-holiday";
import { AdminHolidaysRequest } from "@app/contracts/endpoints/admin.holidays";
import { AdminListHolidaysResponse } from "@app/contracts/endpoints/admin.listHolidays";
import { useNow, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { errorMessage } from "@/lib/api";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { FormField, ThaiDatePicker } from "../shared/form";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function HolidayFields({ id, day, onChange }: { id: string; day: PublicHoliday; onChange: (day: PublicHoliday) => void }) {
  const t = useTranslations("AD-07");
  return (
    <div className="grid max-w-xl gap-4">
      <FormField id={`${id}-date`} label={t("date")}>
        <ThaiDatePicker
          id={`${id}-date`}
          value={day.date || null}
          onValueChange={(date) => onChange({ ...day, date: date ?? "" })}
          placeholder={t("date")}
        />
      </FormField>
      <FormField id={`${id}-name`} label={t("name")}>
        <Input
          id={`${id}-name`}
          type="text"
          className="h-11"
          value={day.nameTh}
          onChange={(event) => onChange({ ...day, nameTh: event.target.value })}
        />
      </FormField>
    </div>
  );
}

type DraftDay = PublicHoliday & { key: string };

export function HolidayEditor({ year, initialDays }: { year: number; initialDays: PublicHoliday[] }) {
  const t = useTranslations("AD-07");
  // The keyed year editor copies the successful load once; refetches cannot overwrite an unsaved draft.
  const [days, setDays] = useState(() => initialDays.map((day) => ({ ...day, key: crypto.randomUUID() })));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const mutation = useApiMutation("admin.holidays", { invalidate: ["admin.listHolidays"], meta: { toast: false } });
  const edit = (update: (previous: DraftDay[]) => DraftDay[]) => {
    setDays(update);
    setSaved(false);
    setError("");
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mutation.isPending) return;
    setError("");
    setSaved(false);
    const parsed = AdminHolidaysRequest.safeParse({ days });
    if (!parsed.success || parsed.data.days.some((day) => !day.date.startsWith(`${year}-`))) {
      setError(t("validation"));
      return;
    }
    try {
      await mutation.mutateAsync({ params: { year: String(year) }, body: parsed.data });
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">{t("saved")}</p>}
      <fieldset disabled={mutation.isPending} className="flex flex-col gap-4">
        <legend>{t("rows")}</legend>
        {days.map((day, index) => (
          <div key={day.key} className="flex items-end gap-4">
            <HolidayFields
              id={`holiday-${index}`}
              day={day}
              onChange={(next) => edit((rows) => rows.map((row, i) => (i === index ? { ...next, key: row.key } : row)))}
            />
            <Button type="button" variant="outline" onClick={() => edit((rows) => rows.filter((_, i) => i !== index))}>
              {t("remove")}
            </Button>
          </div>
        ))}
      </fieldset>
      <Button
        type="button"
        variant="outline"
        disabled={mutation.isPending}
        onClick={() => edit((rows) => [...rows, { date: "", nameTh: "", key: crypto.randomUUID() }])}
      >
        {t("add")}
      </Button>
      <Button type="submit" disabled={mutation.isPending}>
        {t(mutation.isPending ? "saving" : "save")}
      </Button>
    </form>
  );
}

export function HolidayScreen() {
  const t = useTranslations("AD-07");
  const now = useNow();
  const [year, setYear] = useState(Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Bangkok", year: "numeric" }).format(now)));
  const validYear = Number.isInteger(year) && year >= 1000 && year <= 9999;
  const query = useApiQuery(
    "admin.listHolidays",
    { params: { year: String(year) }, response: AdminListHolidaysResponse },
    { enabled: validYear, meta: { toast: false } },
  );
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-4 font-medium">{t("year")}</legend>
        <FormField id="holiday-year" label={t("yearLabel")}>
          <Input
            id="holiday-year"
            type="number"
            min={1000}
            max={9999}
            value={year === 0 ? "" : year}
            onChange={(event) => {
              setYear(Number(event.target.value));
            }}
          />
        </FormField>
      </fieldset>
      {!validYear ? (
        <p role="alert">{t("yearValidation")}</p>
      ) : query.isPending ? (
        <p role="status">{t("loading")}</p>
      ) : query.isError ? (
        <div role="alert">
          {errorMessage(query.error)}
          <Button type="button" onClick={() => query.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : (
        <HolidayEditor key={year} year={year} initialDays={query.data ?? []} />
      )}
      {(!validYear || query.isPending || query.isError) && <Button disabled>{t("save")}</Button>}
    </section>
  );
}
