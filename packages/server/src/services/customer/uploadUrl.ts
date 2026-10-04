import type { CustomerUploadUrlRequest, CustomerUploadUrlResponse } from "@app/contracts/endpoints/customer.uploadUrl";
import type { FileKind } from "@app/contracts/enums";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { createUploadTicket } from "../../files.ts";

/** R-25: a customer may upload only these kinds. */
const CUSTOMER_KINDS: readonly FileKind[] = ["pet_profile", "vaccine_proof", "slip"];

/** 05#ep-customer.uploadUrl: LIFF upload ticket for the branch in the path (org from the `cid` session). */
export async function customerUploadUrl(ctx: RequestContext, input: CustomerUploadUrlRequest): Promise<CustomerUploadUrlResponse> {
  if (ctx.actor.type !== "customer" || !ctx.actor.id) throw new AppError("UNAUTHENTICATED");
  if (!CUSTOMER_KINDS.includes(input.kind)) throw new AppError("UPLOAD_KIND_NOT_ALLOWED");
  return withTx(ctx, (tx) => createUploadTicket(tx, ctx, input));
}
