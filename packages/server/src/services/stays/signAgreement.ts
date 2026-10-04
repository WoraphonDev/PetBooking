import type { StaysSignAgreementRequest, StaysSignAgreementResponse } from "@app/contracts/endpoints/stays.signAgreement";
import { booking, branchPolicy, consentDocument, stay } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb, withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { commitFile } from "../../files.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { stayDetail } from "./get.ts";

/**
 * 05#ep-stays.signAgreement: a new boarding_agreement consent_document (immutable — signing again adds a row) with
 * body_snapshot = branch_policy.boarding_agreement_text and the committed PNG signature.
 */
export async function staysSignAgreement(
  ctx: RequestContext,
  input: StaysSignAgreementRequest & { stayId: string },
): Promise<StaysSignAgreementResponse> {
  requireRole(ctx, "stays.signAgreement");
  await withTx(ctx, async (tx) => {
    const db = tenantDb(ctx, tx);
    const [s] = (await db.select(stay, eq(stay.id, input.stayId))) as (typeof stay.$inferSelect)[];
    if (!s) throw new AppError("NOT_FOUND");
    const [bk] = (await db.select(booking, eq(booking.id, s.bookingId))) as (typeof booking.$inferSelect)[];
    if (!bk) throw new AppError("NOT_FOUND");
    const file = await commitFile(tx, ctx, input.signatureFileId, "signature");
    if (file.mimeType !== "image/png")
      throw new AppError("VALIDATION_FAILED", { fields: { signatureFileId: "a PNG signature is required" } });
    // branch_policy is keyed by the org-checked branch; a missing row means the column default ("")
    const [policy] = await tx.select().from(branchPolicy).where(eq(branchPolicy.branchId, s.branchId));
    await db.insert(consentDocument, {
      kind: "boarding_agreement",
      stayId: s.id,
      customerId: bk.customerId,
      bodySnapshot: policy?.boardingAgreementText ?? "",
      emergencyVetLimitSatang: input.emergencyVetLimitSatang ?? null,
      signerName: input.signerName,
      signatureFileId: input.signatureFileId,
      signedAt: ctx.now,
      createdAt: ctx.now,
    });
  });
  return stayDetail(ctx, getDb(), input.stayId);
}
