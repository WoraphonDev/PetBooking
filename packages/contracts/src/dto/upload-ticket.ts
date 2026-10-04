import { z } from "zod";
import { Uuid } from "../common.ts";

/** 05#dto-UploadTicket — presigned PUT for a new file_object (R-25). */
export const UploadTicket = z.object({
  fileId: Uuid,
  /** presigned PUT URL, valid 5 minutes */
  uploadUrl: z.string(),
  /** headers the PUT must send (Content-Type) */
  headers: z.record(z.string(), z.string()),
  storageKey: z.string(),
});
export type UploadTicket = z.infer<typeof UploadTicket>;
