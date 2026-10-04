import { z } from "zod";
import { AppointmentCard } from "./appointment-card.ts";
import { PhotoItem } from "./photo-item.ts";
import { TemperamentFlagItem } from "./temperament-flag-item.ts";

/** 05#dto-JobCard — what the groomer needs for one appointment. */
export const JobCard = z.object({
  appointment: AppointmentCard,
  preferredStyle: z.string().nullable(),
  bladeNo: z.string().nullable(),
  shampooOk: z.string().nullable(),
  shampooAvoid: z.string().nullable(),
  allergies: z.string().nullable(),
  conditions: z.string().nullable(),
  internalNote: z.string().nullable(),
  /** signed URL of pet_shop_profile.favorite_style_photo_id */
  favoriteStylePhotoUrl: z.string().nullable(),
  flags: z.array(TemperamentFlagItem),
  weightGramsCheckin: z.number().int().nullable(),
  conditionFlags: z.array(z.string()),
  conditionNote: z.string().nullable(),
  customerNote: z.string().nullable(),
  /** the pet's previous done/picked-up grooming at this shop; null on the first visit */
  lastVisit: z.object({ photos: z.array(PhotoItem), staffNote: z.string().nullable() }).nullable(),
  photos: z.array(PhotoItem),
  consentSigned: z.boolean(),
});
export type JobCard = z.infer<typeof JobCard>;
