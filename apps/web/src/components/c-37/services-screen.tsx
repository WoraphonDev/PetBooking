"use client";
import type { ServiceItem } from "@app/contracts/dto/service-item";
import type { SizeTierItem } from "@app/contracts/dto/size-tier-item";
import { ServicesCreateResponse } from "@app/contracts/endpoints/services.create";
import { ServicesListResponse } from "@app/contracts/endpoints/services.list";
import { ServicesSetAddonLinksResponse } from "@app/contracts/endpoints/services.setAddonLinks";
import { ServicesSetPricesResponse } from "@app/contracts/endpoints/services.setPrices";
import { ServicesUpdateResponse } from "@app/contracts/endpoints/services.update";
import { SizeTiersListResponse } from "@app/contracts/endpoints/sizeTiers.list";
import { SurchargeTypesListResponse } from "@app/contracts/endpoints/surchargeTypes.list";
import { SurchargeTypesUpsertResponse } from "@app/contracts/endpoints/surchargeTypes.upsert";
import { type ServiceScope, serviceCategoryValues, speciesValues } from "@app/contracts/enums";
import { cn } from "cn";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { formatTHB } from "../../lib/format";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { EnumSelect, FormField } from "../shared/form";
import { PhotoUploader, staffTicket } from "../shared/upload";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import {
  byOrder,
  cellKey,
  columns,
  emptyService,
  fromPrice,
  gridFrom,
  moveTarget,
  type PriceGrid,
  parseScope,
  pricesBody,
  SCOPES,
  type ServiceErrors,
  type ServiceForm,
  serviceBody,
  serviceFormFrom,
  tierRows,
  updateFromCreate,
} from "./logic";
import { SurchargeSection } from "./surcharges";

type T = ReturnType<typeof useTranslations<"C-37">>;
const INVALIDATE = ["services.list"] as const;

/** 06#scr-C-37 — owner manages services, add-on links and the price table per size / coat and surcharge types. */
export function ServicesScreen() {
  const t = useTranslations("C-37");
  const common = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const scope = parseScope(params.get("scope"));
  const services = useApiQuery("services.list", { query: { scope, includeArchived: true }, response: ServicesListResponse });
  const tiers = useApiQuery("sizeTiers.list", { response: SizeTiersListResponse });
  const surcharges = useApiQuery("surchargeTypes.list", { response: SurchargeTypesListResponse });
  const invalidate = [...INVALIDATE];
  const create = useApiMutation("services.create", { response: ServicesCreateResponse, invalidate });
  const update = useApiMutation("services.update", { response: ServicesUpdateResponse, invalidate });
  const setPrices = useApiMutation("services.setPrices", { response: ServicesSetPricesResponse, invalidate });
  const setLinks = useApiMutation("services.setAddonLinks", { response: ServicesSetAddonLinksResponse, invalidate });
  const upsertSurcharges = useApiMutation("surchargeTypes.upsert", {
    response: SurchargeTypesUpsertResponse,
    invalidate: ["surchargeTypes.list"],
  });
  /** null = list only, "new" = blank form, else the service being edited */
  const [selected, setSelected] = useState<"new" | string | null>(null);

  if (services.isPending || tiers.isPending) return <Skeleton className="m-6 h-96" />;
  if (services.isError || tiers.isError)
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p role="alert">{errorMessage(services.error ?? tiers.error)}</p>
        <Button
          type="button"
          onClick={() => {
            void services.refetch();
            void tiers.refetch();
          }}
        >
          {common("retry")}
        </Button>
      </div>
    );
  const list = [...services.data].sort(byOrder);
  const current = selected && selected !== "new" ? list.find((s) => s.id === selected) : undefined;
  const saved = () => toast.success(t("saved"));
  const busy = create.isPending || update.isPending || setPrices.isPending || setLinks.isPending;
  return (
    <div data-screen="C-37" className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>
      <div role="tablist" className="flex gap-1 border-b">
        {SCOPES.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={scope === s}
            className={cn(
              "h-11 border-b-2 px-4 text-sm",
              scope === s ? "border-primary font-medium" : "border-transparent text-muted-foreground",
            )}
            onClick={() => {
              setSelected(null);
              router.replace(`${pathname}?scope=${s}`);
            }}
          >
            {enumLabel("service_scope", s)}
          </button>
        ))}
      </div>
      <ServiceList
        t={t}
        list={list}
        busy={busy}
        onAdd={() => setSelected("new")}
        onEdit={(s) => setSelected(s.id)}
        onToggleOnline={async (s) => {
          await update.mutateAsync({ params: { serviceId: s.id }, body: { onlineBookable: !s.onlineBookable } });
          saved();
        }}
        onToggleStatus={async (s) => {
          await update.mutateAsync({ params: { serviceId: s.id }, body: { status: s.status === "active" ? "archived" : "active" } });
          saved();
        }}
        onMove={async (index, dir) => {
          const pair = moveTarget(list, index, dir);
          if (!pair) return;
          const [a, b] = pair;
          // swap the two sort orders (equal orders get distinct values)
          const [oa, ob] = a.sortOrder === b.sortOrder ? [b.sortOrder + dir, a.sortOrder] : [b.sortOrder, a.sortOrder];
          await update.mutateAsync({ params: { serviceId: a.id }, body: { sortOrder: oa } });
          await update.mutateAsync({ params: { serviceId: b.id }, body: { sortOrder: ob } });
        }}
      />
      {selected ? (
        <ServiceEditor
          key={selected}
          t={t}
          scope={scope}
          service={current}
          mains={list.filter((s) => !s.isAddon && s.status === "active" && s.id !== current?.id)}
          tiers={tiers.data}
          nextOrder={(list.at(-1)?.sortOrder ?? 0) + 1}
          busy={busy}
          onSaveService={async (body) => {
            if (current) await update.mutateAsync({ params: { serviceId: current.id }, body: updateFromCreate(body) });
            else {
              const created = await create.mutateAsync({ body });
              setSelected(created.id);
            }
            saved();
          }}
          onSaveLinks={async (baseServiceIds) => {
            if (!current) return;
            await setLinks.mutateAsync({ params: { serviceId: current.id }, body: { baseServiceIds } });
            saved();
          }}
          onSavePrices={async (body) => {
            if (!current) return;
            await setPrices.mutateAsync({ params: { serviceId: current.id }, body });
            saved();
          }}
        />
      ) : null}
      <SurchargeSection
        t={t}
        items={surcharges.data ?? []}
        busy={upsertSurcharges.isPending}
        onSave={async (body) => {
          await upsertSurcharges.mutateAsync({ body });
          saved();
        }}
      />
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium text-lg">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function ServiceList(props: {
  t: T;
  list: ServiceItem[];
  busy: boolean;
  onAdd: () => void;
  onEdit: (s: ServiceItem) => void;
  onToggleOnline: (s: ServiceItem) => void;
  onToggleStatus: (s: ServiceItem) => void;
  onMove: (index: number, dir: -1 | 1) => void;
}) {
  const { t, list } = props;
  return (
    <Section
      title={t("sectionList")}
      aside={
        <Button type="button" className="h-11" onClick={props.onAdd}>
          {t("add")}
        </Button>
      }
    >
      {list.length === 0 ? <p className="text-muted-foreground text-sm">{t("noServices")}</p> : null}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-2">{t("order")}</th>
            <th className="py-2">{t("name")}</th>
            <th className="py-2">{t("category")}</th>
            <th className="py-2 text-right">{t("fromPrice")}</th>
            <th className="py-2">{t("onlineBookable")}</th>
            <th className="py-2">{t("status")}</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {list.map((s, i) => {
            const price = fromPrice(s);
            return (
              <tr key={s.id} className={cn("border-t", s.status === "archived" && "text-muted-foreground")}>
                <td className="py-2">
                  <span className="flex gap-1">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("moveUp")}
                      disabled={props.busy || i === 0}
                      onClick={() => props.onMove(i, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("moveDown")}
                      disabled={props.busy || i === list.length - 1}
                      onClick={() => props.onMove(i, 1)}
                    >
                      ↓
                    </Button>
                  </span>
                </td>
                <td className="py-2">
                  {s.nameTh}
                  {s.isAddon ? <span className="ml-2 rounded bg-muted px-1.5 text-xs">{t("addonTag")}</span> : null}
                </td>
                <td className="py-2">{enumLabel("service_category", s.category)}</td>
                <td className="py-2 text-right tabular-nums">{price === null ? "—" : formatTHB({ satang: price })}</td>
                <td className="py-2">
                  <Switch
                    aria-label={`${t("onlineBookable")} ${s.nameTh}`}
                    checked={s.onlineBookable}
                    disabled={props.busy}
                    onCheckedChange={() => props.onToggleOnline(s)}
                  />
                </td>
                <td className="py-2">{t(s.status === "active" ? "statusActive" : "statusArchived")}</td>
                <td className="py-2 text-right">
                  <span className="flex justify-end gap-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => props.onEdit(s)}>
                      {t("edit")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={props.busy} onClick={() => props.onToggleStatus(s)}>
                      {t(s.status === "active" ? "archive" : "restore")}
                    </Button>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

export function ServiceEditor(props: {
  t: T;
  scope: ServiceScope;
  service: ServiceItem | undefined;
  mains: ServiceItem[];
  tiers: SizeTierItem[];
  nextOrder: number;
  busy: boolean;
  onSaveService: (body: NonNullable<ReturnType<typeof serviceBody>["body"]>) => Promise<void>;
  onSaveLinks: (ids: string[]) => Promise<void>;
  onSavePrices: (body: NonNullable<ReturnType<typeof pricesBody>["body"]>) => Promise<void>;
}) {
  const { t, scope, service } = props;
  const [form, setForm] = useState<ServiceForm>(() => (service ? serviceFormFrom(service) : emptyService(scope)));
  const [errors, setErrors] = useState<ServiceErrors>({});
  const [grid, setGrid] = useState<PriceGrid>(() => (service ? gridFrom(service) : { splitCoat: false, cells: {} }));
  const [badCells, setBadCells] = useState<string[]>([]);
  const set = <K extends keyof ServiceForm>(k: K, v: ServiceForm[K]) => setForm({ ...form, [k]: v });
  const rows = [null, ...tierRows(props.tiers, form.speciesAllowed)];
  const cell = (tierId: string | null, coat: "any" | "short" | "long") => grid.cells[cellKey(tierId, coat)] ?? { price: "", minutes: "" };
  const setCell = (tierId: string | null, coat: "any" | "short" | "long", next: { price?: string; minutes?: string }) =>
    setGrid({ ...grid, cells: { ...grid.cells, [cellKey(tierId, coat)]: { ...cell(tierId, coat), ...next } } });
  return (
    <>
      <Section title={t("sectionForm")}>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField id="c37-name" label={t("nameTh")} error={errors.nameTh ? t("invalid") : undefined}>
            <Input id="c37-name" className="h-11" maxLength={80} value={form.nameTh} onChange={(e) => set("nameTh", e.target.value)} />
          </FormField>
          <FormField id="c37-category" label={t("category")} error={errors.category ? t("categoryMismatch") : undefined}>
            <EnumSelect
              id="c37-category"
              enumName="service_category"
              values={serviceCategoryValues}
              value={form.category}
              onValueChange={(v) => v && set("category", v)}
            />
          </FormField>
          <FormField id="c37-description" label={t("description")}>
            <Textarea id="c37-description" maxLength={500} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </FormField>
          <FormField id="c37-photo" label={t("photo")}>
            <PhotoUploader
              kind="service_photo"
              requestTicket={staffTicket}
              value={form.photo ? [form.photo] : []}
              onChange={(next) => set("photo", next[0] ?? null)}
              labels={{ camera: t("camera"), album: t("album"), uploading: t("uploading") }}
            />
          </FormField>
          <FormField id="c37-species" label={`${t("speciesAllowed")} (${t("speciesHint")})`}>
            <fieldset id="c37-species" className="flex flex-wrap gap-3">
              {speciesValues.map((sp) => (
                <label key={sp} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.speciesAllowed.includes(sp)}
                    onChange={(e) =>
                      set("speciesAllowed", e.target.checked ? [...form.speciesAllowed, sp] : form.speciesAllowed.filter((x) => x !== sp))
                    }
                  />
                  {enumLabel("species", sp)}
                </label>
              ))}
            </fieldset>
          </FormField>
          <label htmlFor="c37-addon" className="flex min-h-11 items-center justify-between gap-3 self-start">
            <span className="font-medium text-sm">{t("isAddon")}</span>
            <Switch id="c37-addon" checked={form.isAddon} onCheckedChange={(v) => set("isAddon", v)} />
          </label>
          {scope === "hotel" ? (
            <label htmlFor="c37-perday" className="flex min-h-11 items-center justify-between gap-3 self-start">
              <span className="font-medium text-sm">{t("addonPerDay")}</span>
              <Switch id="c37-perday" checked={form.addonPerDay} disabled={!form.isAddon} onCheckedChange={(v) => set("addonPerDay", v)} />
            </label>
          ) : null}
          <FormField id="c37-cost" label={t("estCost")} error={errors.estCost ? t("invalid") : undefined}>
            <Input
              id="c37-cost"
              className="h-11"
              inputMode="decimal"
              value={form.estCost}
              onChange={(e) => set("estCost", e.target.value)}
            />
          </FormField>
        </div>
        <Button
          type="button"
          className="h-11 self-end"
          disabled={props.busy}
          onClick={() => {
            const { body, errors: found } = serviceBody(scope, form, service?.sortOrder ?? props.nextOrder);
            setErrors(found);
            if (body) void props.onSaveService(body);
          }}
        >
          {t("saveService")}
        </Button>
      </Section>

      {service && form.isAddon ? (
        <Section title={`${t("baseServices")} (${t("baseHint")})`}>
          <fieldset className="flex flex-wrap gap-3">
            {props.mains.map((m) => (
              <label key={m.id} className="flex min-h-11 items-center gap-2 rounded-lg border px-3">
                <input
                  type="checkbox"
                  checked={form.baseServiceIds.includes(m.id)}
                  onChange={(e) =>
                    set("baseServiceIds", e.target.checked ? [...form.baseServiceIds, m.id] : form.baseServiceIds.filter((x) => x !== m.id))
                  }
                />
                {m.nameTh}
              </label>
            ))}
          </fieldset>
          <Button
            type="button"
            variant="outline"
            className="h-11 self-end"
            disabled={props.busy}
            onClick={() => void props.onSaveLinks(form.baseServiceIds)}
          >
            {t("saveLinks")}
          </Button>
        </Section>
      ) : null}

      {service ? (
        <Section
          title={t("sectionPrices")}
          aside={
            <label htmlFor="c37-split" className="flex items-center gap-2 text-sm">
              {t("splitCoat")}
              <Switch id="c37-split" checked={grid.splitCoat} onCheckedChange={(splitCoat) => setGrid({ ...grid, splitCoat })} />
            </label>
          }
        >
          <p className="text-muted-foreground text-xs">{t("priceHint")}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2">{t("size")}</th>
                  {columns(grid.splitCoat).map((c) => (
                    <th key={c} className="py-2" colSpan={2}>
                      {enumLabel("coat_group", c)}
                    </th>
                  ))}
                </tr>
                <tr className="text-left text-muted-foreground text-xs">
                  <th />
                  {columns(grid.splitCoat).flatMap((c) => [<th key={`${c}-p`}>{t("price")}</th>, <th key={`${c}-m`}>{t("minutes")}</th>])}
                </tr>
              </thead>
              <tbody>
                {rows.map((tier) => (
                  <tr key={tier?.id ?? "all"} className="border-t">
                    <td className="py-2 pr-2">{tier ? `${enumLabel("species", tier.species)} · ${tier.labelTh}` : t("allSizes")}</td>
                    {columns(grid.splitCoat).flatMap((c) => {
                      const key = cellKey(tier?.id ?? null, c);
                      const bad = badCells.includes(key);
                      return [
                        <td key={`${key}-p`} className="py-1 pr-1">
                          <Input
                            aria-label={`${t("price")} ${tier?.labelTh ?? t("allSizes")} ${enumLabel("coat_group", c)}`}
                            aria-invalid={bad}
                            inputMode="decimal"
                            className="h-10 w-24 text-right"
                            value={cell(tier?.id ?? null, c).price}
                            onChange={(e) => setCell(tier?.id ?? null, c, { price: e.target.value })}
                          />
                        </td>,
                        <td key={`${key}-m`} className="py-1 pr-2">
                          <Input
                            aria-label={`${t("minutes")} ${tier?.labelTh ?? t("allSizes")} ${enumLabel("coat_group", c)}`}
                            aria-invalid={bad}
                            inputMode="numeric"
                            className="h-10 w-20 text-right"
                            value={cell(tier?.id ?? null, c).minutes}
                            onChange={(e) => setCell(tier?.id ?? null, c, { minutes: e.target.value })}
                          />
                        </td>,
                      ];
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {badCells.length ? (
            <p role="alert" className="text-destructive text-sm">
              {t("invalid")}
            </p>
          ) : null}
          <Button
            type="button"
            className="h-11 self-end"
            disabled={props.busy}
            onClick={() => {
              const { body, bad } = pricesBody(
                grid,
                rows.map((r) => r?.id ?? null),
              );
              setBadCells(bad);
              if (body) void props.onSavePrices(body);
            }}
          >
            {t("savePrices")}
          </Button>
        </Section>
      ) : null}
    </>
  );
}
