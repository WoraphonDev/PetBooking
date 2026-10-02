"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormField, ThaiDatePicker } from "../shared/form";
import { Input } from "../ui/input";

export function HolidayFields() {
  const t = useTranslations("AD-07");
  const [date, setDate] = useState<string | null>(null);
  const [name, setName] = useState("");
  return (
    <div className="grid max-w-xl gap-4">
      <FormField id="holiday-date" label={t("date")}>
        <ThaiDatePicker id="holiday-date" value={date} onValueChange={setDate} placeholder={t("date")} />
      </FormField>
      <FormField id="holiday-name" label={t("name")}>
        <Input id="holiday-name" type="text" className="h-11" value={name} onChange={(event) => setName(event.target.value)} />
      </FormField>
    </div>
  );
}

export function HolidayScreen() {
  const t = useTranslations("AD-07");
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-4 font-medium">{t("year")}</legend>
        <HolidayFields />
      </fieldset>
    </section>
  );
}
