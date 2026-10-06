import type { PublicBranchRequest, PublicBranchResponse } from "@app/contracts/endpoints/public.branch";
import { branch, organization } from "@app/db/schema";
import { eq } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { shopPublic } from "../liff/shop.ts";

/** 05#ep-public.branch: "cache 60 วินาที" — per-process, keyed by slug, measured on ctx.now */
export const PUBLIC_BRANCH_CACHE_MS = 60_000;
const cache = new Map<string, { expiresAt: number; value: PublicBranchResponse }>();

/** tests only */
export function resetPublicBranchCache(): void {
  cache.clear();
}

export async function publicBranch(ctx: RequestContext, input: PublicBranchRequest): Promise<PublicBranchResponse> {
  const hit = cache.get(input.bookingSlug);
  if (hit && hit.expiresAt > ctx.now.getTime()) return hit.value;

  // the slug is the only key a visitor has: this lookup finds the tenant before tenantDb can scope anything
  const db = getDb();
  const [br] = await db.select().from(branch).where(eq(branch.bookingSlug, input.bookingSlug));
  if (!br || br.status !== "active") throw new AppError("NOT_FOUND");
  const [org] = await db.select({ status: organization.status }).from(organization).where(eq(organization.id, br.organizationId));
  // a suspended shop is not publicly bookable (Q-1033)
  if (!org || org.status === "suspended") throw new AppError("NOT_FOUND");

  const scoped: RequestContext = { ...ctx, orgId: br.organizationId, branchId: br.id, timezone: br.timezone };
  const value = await shopPublic(scoped, db, br.id);
  cache.set(input.bookingSlug, { expiresAt: ctx.now.getTime() + PUBLIC_BRANCH_CACHE_MS, value });
  return value;
}
