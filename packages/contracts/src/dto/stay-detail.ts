import { z } from "zod";
import { IsoInstant, LocalTime, Money, Uuid } from "../common.ts";
import { CareTaskItem } from "./care-task-item.ts";
import { PhotoItem } from "./photo-item.ts";
import { StayCard } from "./stay-card.ts";

/** 05#dto-StayDetail — a stay in full. */
export const StayDetail = z.object({
  stay: StayCard,
  weightGramsIn: z.number().int().nullable(),
  weightGramsOut: z.number().int().nullable(),
  vaccineOverrideReason: z.string().nullable(),
  checkedInAt: IsoInstant.nullable(),
  checkedOutAt: IsoInstant.nullable(),
  /** null until the intake is started */
  intake: z
    .object({
      foodBrand: z.string().nullable(),
      foodAmount: z.string().nullable(),
      feedingTimes: z.array(LocalTime),
      foodProvidedByOwner: z.boolean(),
      walksPerDay: z.number().int(),
      conditionNote: z.string().nullable(),
      conditionPhotoUrls: z.array(z.string()),
      emergencyContactName: z.string().nullable(),
      emergencyContactPhone: z.string().nullable(),
      vetClinicName: z.string().nullable(),
      vetClinicPhone: z.string().nullable(),
      completedAt: IsoInstant.nullable(),
    })
    .nullable(),
  medications: z.array(
    z.object({ id: Uuid, name: z.string(), dose: z.string(), times: z.array(LocalTime), instructions: z.string().nullable() }),
  ),
  belongings: z.array(
    z.object({
      id: Uuid,
      item: z.string(),
      quantity: z.number().int(),
      photoUrl: z.string().nullable(),
      returnedAt: IsoInstant.nullable(),
    }),
  ),
  addons: z.array(z.object({ id: Uuid, name: z.string(), quantity: z.number().int(), totalSatang: Money })),
  tasks: z.array(CareTaskItem),
  updates: z.array(PhotoItem),
  /** the latest boarding agreement signed for the stay, null before one is signed */
  agreement: z.object({ signerName: z.string(), signedAt: IsoInstant, emergencyVetLimitSatang: Money.nullable() }).nullable(),
});
export type StayDetail = z.infer<typeof StayDetail>;
