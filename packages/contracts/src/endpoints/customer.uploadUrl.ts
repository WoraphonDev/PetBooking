import { z } from "zod";
import { UploadTicket } from "../dto/upload-ticket.ts";
import { fileKind } from "../enums.ts";

/** 05#ep-customer.uploadUrl — R-25 checks kind/MIME/size on the server. */
export const CustomerUploadUrlRequest = z.object({
  kind: fileKind,
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
});
export type CustomerUploadUrlRequest = z.infer<typeof CustomerUploadUrlRequest>;
export const CustomerUploadUrlResponse = UploadTicket;
export type CustomerUploadUrlResponse = z.infer<typeof CustomerUploadUrlResponse>;
