import { z } from "zod";
import { Uuid } from "../common.ts";
import { StayDetail } from "../dto/stay-detail.ts";

export const StaysSignAgreementParams = z.object({ stayId: Uuid });
export const StaysSignAgreementRequest = z.object({
  signerName: z.string().trim().min(1).max(120),
  // a PNG signature file (checked against file_object in the service)
  signatureFileId: Uuid,
  emergencyVetLimitSatang: z.number().int().min(0).optional(),
});
export type StaysSignAgreementRequest = z.infer<typeof StaysSignAgreementRequest>;
export const StaysSignAgreementResponse = StayDetail;
export type StaysSignAgreementResponse = z.infer<typeof StaysSignAgreementResponse>;
