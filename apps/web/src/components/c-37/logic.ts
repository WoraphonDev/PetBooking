// 06#scr-C-37 — services, price table and add-on links.
import type { ServiceItem } from "@app/contracts/dto/service-item";
import type { SizeTierItem } from "@app/contracts/dto/size-tier-item";
import type { SurchargeTypeItem } from "@app/contracts/dto/surcharge-type-item";
import { ServicesCreateRequest } from "@app/contracts/endpoints/services.create";
import type { ServicesSetPricesRequest } from "@app/contracts/endpoints/services.setPrices";
import type { ServicesUpdateRequest } from "@app/contracts/endpoints/services.update";
import type { SurchargeTypesUpsertRequest } from "@app/contracts/endpoints/surchargeTypes.upsert";
import type { ServiceCategory, ServiceScope, Species } from "@app/contracts/enums";
import { bahtToSatang } from "../shared/form";

export const SCOPES = ["grooming", "hotel", "daycare"] as const;
export const parseScope = (v: string | null): ServiceScope =>
  (SCOPES as readonly string[]).includes(v ?? "") ? (v as ServiceScope) : "grooming";

/** ราคาเริ่ม: lowest price of the table (ServiceItem.fromPriceSatang when the server has it) */
export const fromPrice = (s: ServiceItem): number | null =>
  s.fromPriceSatang ?? (s.prices.length ? Math.min(...s.prices.map((p) => p.priceSatang)) : null);

export const byOrder = (a: ServiceItem, b: ServiceItem) => a.sortOrder - b.sortOrder || a.nameTh.localeCompare(b.nameTh, "th");

export type ServiceForm = {
  nameTh: string;
  category: ServiceCategory;
  description: string;
  photo: { fileId: string; url: string } | null;
  speciesAllowed: Species[];
  isAddon: boolean;
  addonPerDay: boolean;
  baseServiceIds: string[];
  estCost: string;
};
export const emptyService = (scope: ServiceScope): ServiceForm => ({
  nameTh: "",
  category: scope === "hotel" ? "hotel_addon" : scope === "daycare" ? "daycare_addon" : "bath",
  description: "",
  photo: null,
  speciesAllowed: [],
  isAddon: scope !== "grooming",
  addonPerDay: false,
  baseServiceIds: [],
  estCost: "",
});
export function serviceFormFrom(s: ServiceItem): ServiceForm {
  return {
    nameTh: s.nameTh,
    category: s.category,
    description: s.description ?? "",
    photo: s.photoUrl ? { fileId: "", url: s.photoUrl } : null,
    speciesAllowed: s.speciesAllowed,
    isAddon: s.isAddon,
    addonPerDay: s.addonPerDay,
    baseServiceIds: s.addonForServiceIds,
    estCost: s.estCostSatang === null ? "" : String(s.estCostSatang / 100),
  };
}

export type ServiceErrors = Partial<Record<"nameTh" | "estCost" | "category", true>>;
/** ชื่อบริการบังคับ (≤ 80) · ต้นทุน ≥ 0 · category / per-day rules of the API (validService) */
export function serviceBody(
  scope: ServiceScope,
  f: ServiceForm,
  sortOrder: number,
): { body: ServicesCreateRequest | null; errors: ServiceErrors } {
  const errors: ServiceErrors = {};
  const name = f.nameTh.trim();
  if (name.length < 1 || name.length > 80) errors.nameTh = true;
  const cost = f.estCost.trim() ? bahtToSatang(f.estCost) : null;
  if (cost === undefined) errors.estCost = true;
  const body: ServicesCreateRequest = {
    scope,
    category: f.category,
    nameTh: name,
    ...(f.description.trim() ? { description: f.description.trim() } : {}),
    ...(f.photo?.fileId ? { photoFileId: f.photo.fileId } : {}),
    speciesAllowed: f.speciesAllowed,
    isAddon: f.isAddon,
    ...(scope === "hotel" ? { addonPerDay: f.isAddon && f.addonPerDay } : {}),
    ...(typeof cost === "number" ? { estCostSatang: cost } : {}),
    sortOrder,
  };
  if (!errors.nameTh && !ServicesCreateRequest.safeParse(body).success) errors.category = true;
  return Object.keys(errors).length ? { body: null, errors } : { body, errors };
}
/** services.update from the same form (scope fixed, sort order unchanged) */
export function updateFromCreate(body: ServicesCreateRequest): ServicesUpdateRequest {
  const { scope: _scope, sortOrder: _sort, ...rest } = body;
  return rest;
}

/** price table cell: "" = this size is not offered */
export type Cell = { price: string; minutes: string };
export type PriceGrid = { splitCoat: boolean; cells: Record<string, Cell> };
/** row keys: "all" (every size) + each tier id; columns: any | short | long */
export const cellKey = (tierId: string | null, coat: "any" | "short" | "long") => `${tierId ?? "all"}|${coat}`;
export const columns = (splitCoat: boolean) => (splitCoat ? (["short", "long"] as const) : (["any"] as const));
export const tierRows = (tiers: SizeTierItem[], species: Species[]) =>
  tiers
    .filter((t) => species.length === 0 || species.includes(t.species))
    .sort((a, b) => a.species.localeCompare(b.species) || a.sortOrder - b.sortOrder);

export function gridFrom(s: ServiceItem): PriceGrid {
  const splitCoat = s.prices.some((p) => p.coatGroup !== "any");
  const cells: Record<string, Cell> = {};
  for (const p of s.prices)
    cells[cellKey(p.sizeTierId, p.coatGroup)] = { price: String(p.priceSatang / 100), minutes: String(p.durationMinutes) };
  return { splitCoat, cells };
}

/** services.setPrices: filled cells of the visible columns; null + the bad keys when a cell is invalid */
export function pricesBody(grid: PriceGrid, rowIds: (string | null)[]): { body: ServicesSetPricesRequest | null; bad: string[] } {
  const prices: ServicesSetPricesRequest["prices"] = [];
  const bad: string[] = [];
  for (const tierId of rowIds)
    for (const coat of columns(grid.splitCoat)) {
      const key = cellKey(tierId, coat);
      const cell = grid.cells[key];
      if (!cell || (!cell.price.trim() && !cell.minutes.trim())) continue;
      const price = bahtToSatang(cell.price);
      const minutes = /^\d+$/.test(cell.minutes.trim()) ? Number(cell.minutes) : Number.NaN;
      if (typeof price !== "number" || price < 0 || !(minutes >= 0 && minutes <= 600)) {
        bad.push(key);
        continue;
      }
      prices.push({ sizeTierId: tierId, coatGroup: coat, priceSatang: price, durationMinutes: minutes });
    }
  return bad.length ? { body: null, bad } : { body: { prices }, bad };
}

/** ลำดับ: swap with the neighbour (two services.update calls) */
export function moveTarget(list: ServiceItem[], index: number, dir: -1 | 1): [ServiceItem, ServiceItem] | null {
  const a = list[index];
  const b = list[index + dir];
  return a && b ? [a, b] : null;
}

/** one row of ค่าบริการเพิ่มหน้างาน; `id` null = new (surchargeTypes.upsert inserts it) */
export type SurchargeRow = {
  key: string;
  id: string | null;
  nameTh: string;
  /** satang; null = empty, undefined = not a valid amount */
  amountSatang: number | null | undefined;
  active: boolean;
};

export const surchargeRows = (items: SurchargeTypeItem[]): SurchargeRow[] =>
  items.map((x) => ({ key: x.id, id: x.id, nameTh: x.nameTh, amountSatang: x.defaultAmountSatang, active: x.status === "active" }));

/** 06 กติกา (05 validation): ชื่อ 1–60 · ราคาตั้งต้น ≥ 0; returns the keys of the rows that fail */
export function invalidSurcharges(rows: SurchargeRow[]): string[] {
  return rows
    .filter((r) => {
      const name = r.nameTh.trim();
      return name.length < 1 || name.length > 60 || r.amountSatang == null || r.amountSatang < 0;
    })
    .map((r) => r.key);
}

/** surchargeTypes.upsert body: new rows + rows that changed; null while a row is invalid or nothing changed */
export function surchargesBody(rows: SurchargeRow[], before: SurchargeTypeItem[]): SurchargeTypesUpsertRequest | null {
  if (invalidSurcharges(rows).length) return null;
  const items = rows
    .map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      nameTh: r.nameTh.trim(),
      defaultAmountSatang: r.amountSatang as number,
      status: r.active ? ("active" as const) : ("archived" as const),
    }))
    .filter((item) => {
      const old = "id" in item ? before.find((b) => b.id === item.id) : undefined;
      return !old || old.nameTh !== item.nameTh || old.defaultAmountSatang !== item.defaultAmountSatang || old.status !== item.status;
    });
  return items.length ? { items } : null;
}
