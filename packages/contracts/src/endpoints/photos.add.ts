import { z } from "zod";
import { Uuid } from "../common.ts";
import { PhotoItem } from "../dto/photo-item.ts";
import { photoKind } from "../enums.ts";
export const PhotosAddRequest = z.object({
  fileId: Uuid,
  kind: photoKind,
  appointmentId: Uuid.optional(),
  stayId: Uuid.optional(),
  caption: z.string().max(200).optional(),
});
export type PhotosAddRequest = z.infer<typeof PhotosAddRequest>;
export const PhotosAddResponse = PhotoItem;
export type PhotosAddResponse = z.infer<typeof PhotosAddResponse>;
