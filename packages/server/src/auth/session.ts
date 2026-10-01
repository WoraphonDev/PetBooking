// Session tokens (01 §4, 02#tbl-session): cookie holds a random 32-byte token, DB keeps only its sha256.
// Uses the db directly (not tenantDb): a session is resolved before any ctx/orgId exists, and admin/customer sessions are cross-org.
import { createHash, randomBytes } from "node:crypto";
import type { SessionSubject } from "@app/contracts/enums";
import { session } from "@app/db/schema";
import { and, eq } from "drizzle-orm";
import type { Executor } from "../db.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
/** staff 30 days (sliding), customer 30 days, platform admin 12 hours */
export const SESSION_TTL_MS: Record<SessionSubject, number> = {
  staff: 30 * DAY_MS,
  customer: 30 * DAY_MS,
  platform_admin: 12 * 60 * 60 * 1000,
};

export type SessionRow = typeof session.$inferSelect;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  db: Executor,
  input: {
    subjectType: SessionSubject;
    subjectId: string;
    organizationId?: string | null;
    branchId?: string | null;
    supportAccessLogId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  },
  now: Date,
): Promise<{ token: string; session: SessionRow }> {
  const token = randomBytes(32).toString("base64url");
  const [row] = await db
    .insert(session)
    .values({
      ...input,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS[input.subjectType]),
      lastSeenAt: now,
    })
    .returning();
  if (!row) throw new Error("createSession: insert returned no row");
  return { token, session: row };
}

/** Unknown or expired token → null. Staff sessions slide: each valid lookup pushes expiry to now + 30 days. */
export async function lookupSession(db: Executor, token: string, now: Date): Promise<SessionRow | null> {
  const [row] = await db
    .select()
    .from(session)
    .where(eq(session.tokenHash, hashToken(token)));
  if (!row || row.expiresAt.getTime() <= now.getTime()) return null;
  const expiresAt = row.subjectType === "staff" ? new Date(now.getTime() + SESSION_TTL_MS.staff) : row.expiresAt;
  const [updated] = await db.update(session).set({ lastSeenAt: now, expiresAt }).where(eq(session.id, row.id)).returning();
  return updated ?? null;
}

export async function revokeSession(db: Executor, sessionId: string): Promise<void> {
  await db.delete(session).where(eq(session.id, sessionId));
}

/** e.g. staff disabled / password reset → sign out every device of that subject. */
export async function revokeAllFor(db: Executor, subject: { type: SessionSubject; id: string }): Promise<void> {
  await db.delete(session).where(and(eq(session.subjectType, subject.type), eq(session.subjectId, subject.id)));
}
