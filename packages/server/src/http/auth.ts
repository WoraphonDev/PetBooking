// 01 §4 steps 1–2: cookie → session → RequestContext for each namespace (staff `sid`, customer `cid`, admin `aid`).
// Like auth/session.ts, the first lookups (session, org, branch by slug) run before any orgId is known, so they use the db directly;
// rows inside the org (staff_user, customer, the staff's branch) go through tenantDb.
import { randomUUID } from "node:crypto";
import { branch, customer, organization, platformAdmin, staffUser } from "@app/db/schema";
import { asc, eq } from "drizzle-orm";
import { SESSION_COOKIE } from "../auth/cookies.ts";
import { lookupSession, type SessionRow } from "../auth/session.ts";
import type { RequestContext } from "../context.ts";
import { getDb } from "../db.ts";
import { AppError } from "../errors.ts";
import { tenantDb } from "../repo/tenant.ts";
import { clientIp, readCookie } from "./request.ts";

export type Resolved = { ctx: RequestContext; session: SessionRow | null };

export function baseCtx(req: Request, now: Date): RequestContext {
  return {
    now,
    requestId: randomUUID(),
    actor: { type: "system", id: null },
    orgId: null,
    branchId: null,
    timezone: "Asia/Bangkok",
    supportAccessLogId: null,
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  };
}

async function sessionFrom(req: Request, cookie: string, subjects: SessionRow["subjectType"][], now: Date): Promise<SessionRow> {
  const token = readCookie(req, cookie);
  const s = token ? await lookupSession(getDb(), token, now) : null;
  if (!s || !subjects.includes(s.subjectType)) throw new AppError("UNAUTHENTICATED");
  return s;
}

/** org.status = suspended → FORBIDDEN (staff + customer; admin is exempt). */
async function assertOrgActive(orgId: string): Promise<void> {
  const [org] = await getDb().select({ status: organization.status }).from(organization).where(eq(organization.id, orgId));
  if (!org) throw new AppError("UNAUTHENTICATED");
  if (org.status === "suspended") throw new AppError("FORBIDDEN");
}

async function activeAdmin(id: string) {
  const [admin] = await getDb()
    .select({ id: platformAdmin.id, status: platformAdmin.status })
    .from(platformAdmin)
    .where(eq(platformAdmin.id, id));
  if (admin?.status !== "active") throw new AppError("UNAUTHENTICATED");
  return admin;
}

/**
 * `sid` session: a staff member, or a support session (01 §4 Support mode, Q-0007) = platform_admin subject with
 * support_access_log_id + organization_id → actor `{type:"admin", role:"owner"}` (reads like an owner, writes → SUPPORT_READ_ONLY).
 */
export async function resolveStaff(req: Request, now: Date): Promise<Resolved> {
  const s = await sessionFrom(req, SESSION_COOKIE.staff, ["staff", "platform_admin"], now);
  if (!s.organizationId) throw new AppError("UNAUTHENTICATED");
  const support = s.subjectType === "platform_admin";
  if (support && !s.supportAccessLogId) throw new AppError("UNAUTHENTICATED");
  // admin is exempt from the suspended-org check (01 §4 step 2)
  if (!support) await assertOrgActive(s.organizationId);
  const ctx: RequestContext = { ...baseCtx(req, now), orgId: s.organizationId, supportAccessLogId: s.supportAccessLogId };
  const db = tenantDb(ctx, getDb());
  if (support) {
    const admin = await activeAdmin(s.subjectId);
    ctx.actor = { type: "admin", id: admin.id, role: "owner" };
  } else {
    const [staff] = (await db.select(staffUser, eq(staffUser.id, s.subjectId))) as (typeof staffUser.$inferSelect)[];
    // a disabled/removed staff member keeps no access even if a session row survived
    if (staff?.status !== "active") throw new AppError("UNAUTHENTICATED");
    ctx.actor = { type: "staff", id: staff.id, role: staff.role };
  }
  // staff_user has no branch: MVP = 1 branch per org → the org's first branch gives branchId/timezone
  const [br] = (await db.select(branch).orderBy(asc(branch.createdAt)).limit(1)) as (typeof branch.$inferSelect)[];
  ctx.branchId = s.branchId ?? br?.id ?? null;
  ctx.timezone = br?.timezone ?? ctx.timezone;
  return { ctx, session: s };
}

/**
 * The `cid` session must belong to the branch in the path. Unknown slug → NOT_FOUND; session of another shop → UNAUTHENTICATED;
 * no customer row in this org yet → NOT_REGISTERED unless `allowUnregistered` (liff.register, actor.id = null).
 */
export async function resolveCustomer(
  req: Request,
  now: Date,
  branchSlug: string | undefined,
  allowUnregistered: boolean,
): Promise<Resolved> {
  const [br] = branchSlug ? await getDb().select().from(branch).where(eq(branch.bookingSlug, branchSlug)) : [];
  if (!br) throw new AppError("NOT_FOUND");
  const s = await sessionFrom(req, SESSION_COOKIE.customer, ["customer"], now);
  if (s.branchId !== br.id || s.organizationId !== br.organizationId) throw new AppError("UNAUTHENTICATED");
  await assertOrgActive(br.organizationId);
  const ctx: RequestContext = { ...baseCtx(req, now), orgId: br.organizationId, branchId: br.id, timezone: br.timezone };
  const [cust] = (await tenantDb(ctx, getDb()).select(
    customer,
    eq(customer.ownerProfileId, s.subjectId),
  )) as (typeof customer.$inferSelect)[];
  if (!cust && !allowUnregistered) throw new AppError("NOT_REGISTERED");
  ctx.actor = { type: "customer", id: cust?.id ?? null };
  return { ctx, session: s };
}

export async function resolveAdmin(req: Request, now: Date): Promise<Resolved> {
  const s = await sessionFrom(req, SESSION_COOKIE.platform_admin, ["platform_admin"], now);
  const admin = await activeAdmin(s.subjectId);
  const ctx: RequestContext = { ...baseCtx(req, now), actor: { type: "admin", id: admin.id } };
  return { ctx, session: s };
}
