"use client";
import type { PackageTemplateItem } from "@app/contracts/dto/package-template-item";
import type { ServiceItem } from "@app/contracts/dto/service-item";
import type { SizeTierItem } from "@app/contracts/dto/size-tier-item";
import { PackageTemplatesListResponse } from "@app/contracts/endpoints/packageTemplates.list";
import { PackageTemplatesUpsertRequest, PackageTemplatesUpsertResponse } from "@app/contracts/endpoints/packageTemplates.upsert";
import { ServicesListResponse } from "@app/contracts/endpoints/services.list";
import { SizeTiersListResponse } from "@app/contracts/endpoints/sizeTiers.list";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { formatTHB } from "../../lib/format";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { FormField, MoneyInput } from "../shared/form";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm";
export type PackageRow = {
  id?: string;
  nameTh: string;
  serviceId: string;
  sizeTierId: string | null;
  sessionsCount: number | null;
  priceSatang: number | null;
  validityDays: number | null;
  shareScope: PackageTemplateItem["shareScope"];
  status: PackageTemplateItem["status"];
  /** R-14 value from the server; null once price or sessions are edited (shown again after saving) */
  unitValueSatang: number | null;
};
const blankRow = (): PackageRow => ({
  nameTh: "",
  serviceId: "",
  sizeTierId: null,
  sessionsCount: null,
  priceSatang: null,
  validityDays: null,
  shareScope: "single_pet",
  status: "active",
  unitValueSatang: null,
});
const touched = (row: PackageRow) =>
  Boolean(
    row.id ||
      row.nameTh ||
      row.serviceId ||
      row.sizeTierId ||
      row.sessionsCount !== null ||
      row.priceSatang !== null ||
      row.validityDays !== null,
  );

/** existing templates plus one blank row for a new package (an untouched blank row is not saved) */
export function initialPackageRows(templates: PackageTemplateItem[]): PackageRow[] {
  return [...templates.map(({ serviceName: _s, ...row }) => row), blankRow()];
}
const numberOrNull = (text: string) => (text === "" ? null : Number(text));

export function PackageFields({
  row,
  index,
  services,
  tiers,
  onChange,
}: {
  row: PackageRow;
  index: number;
  services: ServiceItem[];
  tiers: SizeTierItem[];
  onChange: (row: PackageRow) => void;
}) {
  const t = useTranslations("C-41");
  const id = `package-${index}`;
  const service = services.find((s) => s.id === row.serviceId);
  const sizes = tiers.filter((tier) => !service || service.speciesAllowed.includes(tier.species));
  const unit = row.unitValueSatang;
  return (
    <fieldset className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
      <legend className="font-semibold">{row.id ? `${t("package")}: ${row.nameTh}` : t("newPackage")}</legend>
      <FormField id={`${id}-name`} label={t("name")}>
        <Input
          id={`${id}-name`}
          className="h-11"
          value={row.nameTh}
          onChange={(event) => onChange({ ...row, nameTh: event.target.value })}
        />
      </FormField>
      <FormField id={`${id}-service`} label={t("service")}>
        <select
          id={`${id}-service`}
          className={selectClass}
          value={row.serviceId}
          onChange={(event) => onChange({ ...row, serviceId: event.target.value })}
        >
          <option value="" />
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nameTh}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id={`${id}-size`} label={t("size")}>
        <select
          id={`${id}-size`}
          className={selectClass}
          value={row.sizeTierId ?? ""}
          onChange={(event) => onChange({ ...row, sizeTierId: event.target.value || null })}
        >
          <option value="">{t("allSizes")}</option>
          {sizes.map((tier) => (
            <option key={tier.id} value={tier.id}>
              {`${enumLabel("species", tier.species)} ${tier.labelTh}`}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id={`${id}-sessions`} label={t("sessions")}>
        <Input
          id={`${id}-sessions`}
          type="number"
          min={2}
          max={50}
          className="h-11"
          value={row.sessionsCount ?? ""}
          onChange={(event) => onChange({ ...row, sessionsCount: numberOrNull(event.target.value), unitValueSatang: null })}
        />
      </FormField>
      <FormField id={`${id}-price`} label={t("price")}>
        <MoneyInput
          id={`${id}-price`}
          value={row.priceSatang}
          onValueChange={(priceSatang) => onChange({ ...row, priceSatang: priceSatang ?? null, unitValueSatang: null })}
        />
      </FormField>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t("unitValue")}</span>
        <output className="flex h-11 items-center">{unit === null ? "—" : formatTHB({ satang: unit })}</output>
      </div>
      <FormField id={`${id}-validity`} label={t("validity")}>
        <Input
          id={`${id}-validity`}
          type="number"
          min={1}
          max={730}
          className="h-11"
          value={row.validityDays ?? ""}
          onChange={(event) => onChange({ ...row, validityDays: numberOrNull(event.target.value) })}
        />
      </FormField>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t("shareScope")}</legend>
        <div className="flex gap-4">
          {(["single_pet", "household"] as const).map((scope) => (
            <label key={scope} className="flex h-11 items-center gap-2">
              <input
                type="radio"
                name={`${id}-share`}
                value={scope}
                checked={row.shareScope === scope}
                onChange={() => onChange({ ...row, shareScope: scope })}
              />
              {enumLabel("package_share_scope", scope)}
            </label>
          ))}
        </div>
      </fieldset>
      <Button
        type="button"
        role="switch"
        aria-checked={row.status === "active"}
        variant={row.status === "active" ? "default" : "outline"}
        className="h-11 self-end"
        onClick={() => onChange({ ...row, status: row.status === "active" ? "archived" : "active" })}
      >
        {t("selling")}
      </Button>
    </fieldset>
  );
}

export function PackageEditor({
  templates,
  services,
  tiers,
}: {
  templates: PackageTemplateItem[];
  services: ServiceItem[];
  tiers: SizeTierItem[];
}) {
  const t = useTranslations("C-41");
  const [rows, setRows] = useState(() => initialPackageRows(templates));
  const [message, setMessage] = useState("");
  const mutation = useApiMutation("packageTemplates.upsert", {
    response: PackageTemplatesUpsertResponse,
    invalidate: ["packageTemplates.list"],
    meta: { toast: false },
  });
  // packages are sold for main services; keep a service a saved template already points at
  const choices = services.filter((s) => (!s.isAddon && s.status === "active") || rows.some((r) => r.serviceId === s.id));
  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (mutation.isPending) return;
        // the request schema drops the display-only unitValueSatang
        const parsed = PackageTemplatesUpsertRequest.safeParse({ items: rows.filter(touched) });
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
          <PackageFields
            key={row.id ?? `new-${index}`}
            row={row}
            index={index}
            services={choices}
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

export function PackageScreen() {
  const t = useTranslations("C-41");
  const templates = useApiQuery("packageTemplates.list", { response: PackageTemplatesListResponse });
  const services = useApiQuery("services.list", { response: ServicesListResponse });
  // Q-0107: size names come from sizeTiers.list
  const tiers = useApiQuery("sizeTiers.list", { response: SizeTiersListResponse });
  const queries = [templates, services, tiers];
  return (
    <section className="grid gap-6">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      {queries.some((q) => q.isPending) ? (
        <p role="status">{t("loading")}</p>
      ) : queries.some((q) => q.isError) ? (
        <p role="alert">{errorMessage(templates.error ?? services.error ?? tiers.error)}</p>
      ) : templates.data && services.data && tiers.data ? (
        <PackageEditor key={JSON.stringify(templates.data)} templates={templates.data} services={services.data} tiers={tiers.data} />
      ) : null}
    </section>
  );
}
