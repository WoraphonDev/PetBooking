import { randomBytes } from "node:crypto";
import type { AdminCreateOrgRequest, AdminCreateOrgResponse } from "@app/contracts/endpoints/admin.createOrg";
import { cancelRefundModeValues, depositTypeValues } from "@app/contracts/enums";
import { branch, branchHours, branchPolicy, groomStation, organization, ratePlan, sizeTier, staffInvite, staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import referenceData from "../../../../../docs/spec/vectors/reference-data.json";
import { hashToken } from "../../auth/session.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { mapPgError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { orgListItem } from "./orgs.ts";

const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;
const { defaultSizeTiers, newShopDefaults, templates } = referenceData;

/** 10 §4 policy_text_generator: the quoted template plus its `{deposit}` / `{refund_mode}` alternatives (enum order). */
function generatePolicyText(policy: typeof branchPolicy.$inferSelect): string {
  const generator = templates.policy_text_generator;
  const template = /'([^']*\{deposit\}[^']*)'/.exec(generator)?.[1];
  const alternatives = (name: string) =>
    [...(generator.split(`{${name}} = `)[1]?.split(", {")[0] ?? "").matchAll(/'([^']*)'/g)].map((m) => m[1] ?? "");
  const deposit = alternatives("deposit")[depositTypeValues.indexOf(policy.defaultDepositType)];
  const refundMode = alternatives("refund_mode")[cancelRefundModeValues.indexOf(policy.cancelRefundMode)];
  if (!template || deposit === undefined || refundMode === undefined) throw new Error("reference-data policy_text_generator is malformed");
  const values: Record<string, string> = {
    deposit: deposit
      .replace("{fixed}", (policy.defaultDepositValue / 100).toLocaleString("th-TH"))
      .replace("{percent}", String(policy.defaultDepositValue)),
    grooming_h: String(policy.groomingFreeCancelHours),
    hotel_h: String(policy.hotelFreeCancelHours),
    daycare_h: String(policy.daycareFreeCancelHours),
    forfeit: String(policy.lateCancelForfeitPercent),
    refund_mode: refundMode,
    reschedule_h: String(policy.rescheduleCutoffHours),
  };
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);
}

export async function adminCreateOrg(ctx: RequestContext, input: AdminCreateOrgRequest): Promise<AdminCreateOrgResponse> {
  try {
    return await createInTx(ctx, input);
  } catch (e) {
    // organization_slug_uq / branch_booking_slug_uq → SLUG_TAKEN, staff_user_email_uq → EMAIL_TAKEN (02 §13)
    throw mapPgError(e);
  }
}

function createInTx(ctx: RequestContext, input: AdminCreateOrgRequest): Promise<AdminCreateOrgResponse> {
  return withTx(ctx, async (tx) => {
    const [org] = await tx
      .insert(organization)
      .values({ name: input.name, slug: input.slug, status: "pilot", createdAt: ctx.now, updatedAt: ctx.now })
      .returning();
    if (!org) throw new Error("Organization insert returned no row");
    const scoped = tenantDb({ ...ctx, orgId: org.id }, tx);
    const [br] = (await scoped.insert(branch, {
      name: input.branchName,
      bookingSlug: input.bookingSlug,
      moduleGrooming: input.modules.grooming,
      moduleHotel: input.modules.hotel,
      moduleDaycare: input.modules.daycare,
      receiptPrefix: newShopDefaults.receipt_prefix,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })) as (typeof branch.$inferSelect)[];
    if (!br) throw new Error("Branch insert returned no row");

    // branch_policy / branch_hours carry no organization_id; they hang off the branch created above.
    const [policy] = await tx
      .insert(branchPolicy)
      .values({
        branchId: br.id,
        groomingConsentText: templates.grooming_consent_text,
        boardingAgreementText: templates.boarding_agreement_text,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .returning();
    if (!policy) throw new Error("Branch policy insert returned no row");
    await tx
      .update(branchPolicy)
      .set({ policyText: generatePolicyText(policy) })
      .where(eq(branchPolicy.branchId, br.id));
    await tx.insert(branchHours).values(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        branchId: br.id,
        weekday,
        isClosed: false,
        opensAt: "09:00",
        closesAt: "18:00",
        createdAt: ctx.now,
      })),
    );

    const plan = newShopDefaults.rate_plan;
    await scoped.insert(ratePlan, {
      branchId: br.id,
      code: plan.code,
      name: plan.name,
      channel: plan.channel as typeof ratePlan.$inferInsert.channel,
      isDefault: plan.is_default,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    });
    await scoped.insert(
      sizeTier,
      defaultSizeTiers.map((tier) => ({
        branchId: br.id,
        species: tier.species as "dog" | "cat",
        code: tier.code,
        labelTh: tier.labelTh,
        minWeightGrams: tier.minGrams,
        maxWeightGrams: tier.maxGrams,
        sortOrder: tier.sortOrder,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })),
    );
    await scoped.insert(
      groomStation,
      newShopDefaults.groom_station.map((station) => ({
        branchId: br.id,
        name: station.name,
        sortOrder: station.sort_order,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })),
    );

    const [owner] = (await scoped.insert(staffUser, {
      email: input.ownerEmail,
      displayName: input.ownerName,
      role: "owner",
      status: "invited",
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })) as (typeof staffUser.$inferSelect)[];
    if (!owner) throw new Error("Owner insert returned no row");
    const token = randomBytes(32).toString("base64url");
    // Q-0019: the inviter is a platform admin with no staff_user row, so the owner invite references the owner itself.
    await scoped.insert(staffInvite, {
      staffUserId: owner.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(ctx.now.getTime() + INVITE_TTL_MS),
      createdBy: owner.id,
      createdAt: ctx.now,
    });

    return {
      organization: await orgListItem(ctx, tx, org),
      ownerInviteUrl: new URL(`/invite/${token}`, process.env.APP_BASE_URL).toString(),
    };
  });
}
