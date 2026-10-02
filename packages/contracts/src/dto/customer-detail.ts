import { z } from "zod";
import { IsoInstant, LocalDate, Money, Uuid } from "../common.ts";
import { bookingChannel, photoConsent } from "../enums.ts";
import { BookingListItem } from "./booking-list-item.ts";
import { CustomerPackageItem } from "./customer-package-item.ts";
import { PetSummary } from "./pet-summary.ts";

/**
 * 05#dto-CustomerDetail. For role staff, customers.get leaves out the optional keys
 * (phone, email, address, internalNote, creditBalanceSatang).
 */
export const CustomerDetail = z.object({
  id: Uuid,
  ownerProfileId: Uuid,
  firstName: z.string(),
  lastName: z.string().nullable(),
  nickname: z.string().nullable(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  birthDate: LocalDate.nullable(),
  addressLine: z.string().nullable().optional(),
  subdistrict: z.string().nullable().optional(),
  district: z.string().nullable().optional(),
  province: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  sourceChannel: bookingChannel,
  referralNote: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactPhone: z.string().nullable(),
  internalNote: z.string().nullable().optional(),
  reliabilityLevel: z.number().int(),
  reliabilityOverride: z.number().int().nullable(),
  lateCancelCount12m: z.number().int(),
  noShowCount12m: z.number().int(),
  blacklisted: z.boolean(),
  blacklistReason: z.string().nullable(),
  depositExempt: z.boolean(),
  photoConsent,
  visitCount: z.number().int(),
  firstVisitAt: IsoInstant.nullable(),
  lastVisitAt: IsoInstant.nullable(),
  creditBalanceSatang: Money.optional(),
  /** null when the owner has no LINE account linked */
  line: z.object({ displayName: z.string().nullable(), pictureUrl: z.string().nullable(), isFriend: z.boolean() }).nullable(),
  pets: z.array(PetSummary),
  activePackages: z.array(CustomerPackageItem),
  upcomingBookings: z.array(BookingListItem),
});
export type CustomerDetail = z.infer<typeof CustomerDetail>;
