import { z } from "zod";
import { Paged, Uuid } from "../common.ts";
import { PhotoItem } from "../dto/photo-item.ts";
import { photoKind } from "../enums.ts";
export const PhotosListRequest = z.object({ petId: Uuid });
export type PhotosListRequest = z.infer<typeof PhotosListRequest>;
export const PhotosListQuery = z.object({
  kind: photoKind.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type PhotosListQuery = z.infer<typeof PhotosListQuery>;
export const PhotosListResponse = Paged(PhotoItem);
export type PhotosListResponse = z.infer<typeof PhotosListResponse>;
