import { z } from "zod";
import { IsoInstant, Uuid } from "../common.ts";
import { photoKind } from "../enums.ts";
export const PhotoItem = z.object({
  id: Uuid,
  kind: photoKind,
  url: z.string(),
  caption: z.string().nullable(),
  takenAt: IsoInstant,
  appointmentId: Uuid.nullable(),
  stayId: Uuid.nullable(),
});
export type PhotoItem = z.infer<typeof PhotoItem>;
