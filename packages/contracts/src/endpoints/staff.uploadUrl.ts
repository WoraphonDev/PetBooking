import { z } from "zod";
import { UploadTicket } from "../dto/upload-ticket.ts";
import { fileKind } from "../enums.ts";

/** 05#ep-staff.uploadUrl — R-25 checks kind/MIME/size on the server. */
export const StaffUploadUrlRequest = z.object({
  kind: fileKind,
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
});
export type StaffUploadUrlRequest = z.infer<typeof StaffUploadUrlRequest>;
export const StaffUploadUrlResponse = UploadTicket;
export type StaffUploadUrlResponse = z.infer<typeof StaffUploadUrlResponse>;
