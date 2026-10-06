import type { LiffMeRequest, LiffMeResponse } from "@app/contracts/endpoints/liff.me";
import { customer, ownerProfile } from "@app/db/schema";
import { eq } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { type Executor, getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** The signed-in customer (withCustomer sets actor.id) and their owner_profile → 05#dto-MyProfile */
export async function myProfile(ctx: RequestContext, db: Executor): Promise<LiffMeResponse> {
  if (ctx.actor.type !== "customer" || !ctx.actor.id) throw new AppError("NOT_FOUND");
  const [cust] = (await tenantDb(ctx, db).select(customer, eq(customer.id, ctx.actor.id))) as (typeof customer.$inferSelect)[];
  if (!cust) throw new AppError("NOT_FOUND");
  // owner_profile has no organization_id: reached through the org-checked customer
  const [profile] = await db.select().from(ownerProfile).where(eq(ownerProfile.id, cust.ownerProfileId));
  if (!profile) throw new AppError("NOT_FOUND");
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    nickname: profile.nickname,
    phone: profile.phoneE164,
    email: profile.email,
    photoConsent: cust.photoConsent,
    creditBalanceSatang: cust.creditBalanceSatang,
  };
}

export async function liffMe(ctx: RequestContext, _input: LiffMeRequest): Promise<LiffMeResponse> {
  return myProfile(ctx, getDb());
}
