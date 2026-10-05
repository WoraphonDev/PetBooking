// 06#scr-C-30 — shop info form ↔ branch.update.
import type { BranchSettings } from "@app/contracts/dto/branch-settings";
import { BranchUpdateRequest } from "@app/contracts/endpoints/branch.update";
import { nextReceiptNo } from "@app/domain/ids/receipt-no";
import { toLocalDate } from "@app/domain/time/local-time";
import { phoneValue } from "../shared/form";

export type ShopForm = {
  name: string;
  logo: { fileId: string; url: string } | null;
  phone: string;
  facebookUrl: string;
  instagramUrl: string;
  addressLine: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  latitude: string;
  longitude: string;
  receiptPrefix: string;
};

export const formFrom = (b: BranchSettings): ShopForm => ({
  name: b.name,
  logo: b.logoUrl ? { fileId: "", url: b.logoUrl } : null,
  phone: b.phone ?? "",
  facebookUrl: b.facebookUrl ?? "",
  instagramUrl: b.instagramUrl ?? "",
  addressLine: b.addressLine ?? "",
  subdistrict: b.subdistrict ?? "",
  district: b.district ?? "",
  province: b.province ?? "",
  postalCode: b.postalCode ?? "",
  latitude: b.latitude === null ? "" : String(b.latitude),
  longitude: b.longitude === null ? "" : String(b.longitude),
  receiptPrefix: b.receiptPrefix,
});

export type ShopErrors = Partial<Record<keyof ShopForm, true>>;

/** branch.update body (blank fields left out) checked with the API's own zod schema; errors per field */
export function updateBody(f: ShopForm): { body: BranchUpdateRequest | null; errors: ShopErrors } {
  const errors: ShopErrors = {};
  const text = (v: string) => (v.trim() ? v.trim() : undefined);
  const phone = phoneValue(f.phone);
  if (phone.error) errors.phone = true;
  const num = (v: string, key: "latitude" | "longitude") => {
    if (!v.trim()) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) errors[key] = true;
    return n;
  };
  const body = {
    name: f.name.trim(),
    ...(phone.e164 ? { phone: phone.e164 } : {}),
    ...(f.logo?.fileId ? { logoFileId: f.logo.fileId } : {}),
    ...(text(f.facebookUrl) ? { facebookUrl: text(f.facebookUrl) } : {}),
    ...(text(f.instagramUrl) ? { instagramUrl: text(f.instagramUrl) } : {}),
    ...(text(f.addressLine) ? { addressLine: text(f.addressLine) } : {}),
    ...(text(f.subdistrict) ? { subdistrict: text(f.subdistrict) } : {}),
    ...(text(f.district) ? { district: text(f.district) } : {}),
    ...(text(f.province) ? { province: text(f.province) } : {}),
    ...(text(f.postalCode) ? { postalCode: text(f.postalCode) } : {}),
    ...(f.latitude.trim() ? { latitude: num(f.latitude, "latitude") } : {}),
    ...(f.longitude.trim() ? { longitude: num(f.longitude, "longitude") } : {}),
    receiptPrefix: f.receiptPrefix.trim().toUpperCase(),
  };
  const parsed = BranchUpdateRequest.safeParse(body);
  if (!parsed.success)
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      const map: Record<string, keyof ShopForm> = { logoFileId: "logo" };
      errors[(map[key] ?? key) as keyof ShopForm] = true;
    }
  return Object.keys(errors).length ? { body: null, errors } : { body: parsed.data ?? null, errors };
}

/** ตัวอย่าง (R-16): the first receipt number of this year with the prefix */
export function receiptExample(prefix: string, now: string, timezone: string): string | null {
  if (!/^[A-Z]{1,3}$/.test(prefix)) return null;
  const yearBe = Number(toLocalDate({ instant: now, timezone }).slice(0, 4)) + 543;
  return nextReceiptNo({ prefix, now, timezone, counter: { yearBe, nextSeq: 1 } }).receiptNo;
}

/** public booking page (P-01) */
export const bookingUrl = (origin: string, slug: string) => `${origin}/b/${slug}`;
