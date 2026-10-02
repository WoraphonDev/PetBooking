import { z } from "zod";
import { LocalDate, Uuid } from "../common.ts";
import { CustomerDetail } from "../dto/customer-detail.ts";
import { photoConsent } from "../enums.ts";

/** PATCH text: absent = unchanged; null or blank = cleared */
const clearableText = (max?: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    (max ? z.string().trim().max(max) : z.string().trim()).nullable().optional(),
  );
const CalendarDate = LocalDate.pipe(z.iso.date());

export const CustomersUpdateParams = z.object({ customerId: Uuid });
export const CustomersUpdateRequest = z.object({
  // owner_profile — same rules as customers.create, plus birth date and address
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: clearableText(60),
  nickname: clearableText(30),
  /** R-22 — normalized by the service (INVALID_PHONE) */
  phone: clearableText(),
  email: clearableText(),
  birthDate: CalendarDate.nullable().optional(),
  addressLine: clearableText(),
  subdistrict: clearableText(),
  district: clearableText(),
  province: clearableText(),
  postalCode: clearableText(),
  // customer
  emergencyContactName: clearableText(),
  /** R-22 */
  emergencyContactPhone: clearableText(),
  internalNote: clearableText(2000),
  /** owner only */
  depositExempt: z.boolean().optional(),
  /** also stamps photo_consent_at */
  photoConsent: photoConsent.optional(),
});
export type CustomersUpdateRequest = z.infer<typeof CustomersUpdateRequest>;
export const CustomersUpdateResponse = CustomerDetail;
export type CustomersUpdateResponse = z.infer<typeof CustomersUpdateResponse>;
