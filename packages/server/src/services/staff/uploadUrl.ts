import type { StaffUploadUrlRequest, StaffUploadUrlResponse } from "@app/contracts/endpoints/staff.uploadUrl";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { createUploadTicket } from "../../files.ts";

/** 05#ep-staff.uploadUrl: any file_kind allowed by R-25 → file_object (uncommitted) + presigned PUT. */
export async function staffUploadUrl(ctx: RequestContext, input: StaffUploadUrlRequest): Promise<StaffUploadUrlResponse> {
  requireRole(ctx, "staff.uploadUrl");
  return withTx(ctx, (tx) => createUploadTicket(tx, ctx, input));
}
