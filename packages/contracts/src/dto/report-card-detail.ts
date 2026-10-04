import { z } from "zod";
import { IsoInstant, LocalDate, Uuid } from "../common.ts";
import { earCondition, nailCondition, parasiteFinding, reportCardKind, reportCardStatus, skinCondition, teethCondition } from "../enums.ts";
import { PetSummary } from "./pet-summary.ts";
import { PhotoItem } from "./photo-item.ts";

/** 05#dto-ReportCardDetail — a report card with its photos and the customer's rating. */
export const ReportCardDetail = z.object({
  id: Uuid,
  kind: reportCardKind,
  status: reportCardStatus,
  pet: PetSummary,
  appointmentId: Uuid.nullable(),
  stayId: Uuid.nullable(),
  skin: skinCondition.nullable(),
  ears: earCondition.nullable(),
  nails: nailCondition.nullable(),
  teeth: teethCondition.nullable(),
  parasites: parasiteFinding.nullable(),
  cooperation: z.number().int().min(1).max(5).nullable(),
  staffNote: z.string().nullable(),
  recommendation: z.string().nullable(),
  groomerName: z.string(),
  beforePhotos: z.array(PhotoItem),
  afterPhotos: z.array(PhotoItem),
  /** groom_appointment_item.name_snapshot of the appointment */
  services: z.array(z.string()),
  /** R-17 dueDate */
  nextGroomDue: LocalDate.nullable(),
  sentAt: IsoInstant.nullable(),
  customerRating: z.number().int().nullable(),
  customerFeedback: z.string().nullable(),
  googleReviewUrl: z.string().nullable(),
});
export type ReportCardDetail = z.infer<typeof ReportCardDetail>;
