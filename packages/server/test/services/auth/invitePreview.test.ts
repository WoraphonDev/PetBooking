import { AuthInvitePreviewQuery, AuthInvitePreviewResponse } from "@app/contracts/endpoints/auth.invitePreview";
import { session, staffInvite, staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { hashToken } from "../../../src/auth/session.ts";
import { resetRateLimits } from "../../../src/http/rate-limit.ts";
import { withPublic } from "../../../src/http/wrap.ts";
import { authInvitePreview } from "../../../src/services/auth/invitePreview.ts";
import { otherOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const GET = withPublic("auth.invitePreview", { query: AuthInvitePreviewQuery }, authInvitePreview);
const DAY = 24 * 60 * 60_000;
let env: TestEnv;
beforeEach(async () => {
  env = await setupTestDb();
  resetRateLimits();
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await env.close();
});

async function seedInvite(
  opts: {
    email?: string | null;
    role?: "owner" | "front_desk" | "staff";
    token?: string;
    expiresInMs?: number;
    acceptedAt?: Date;
    status?: "invited" | "active";
  } = {},
) {
  const [staff] = await env.db
    .insert(staffUser)
    .values({
      organizationId: env.base.orgId,
      email: opts.email === undefined ? "new@a.test" : opts.email,
      displayName: "invited",
      role: opts.role ?? "front_desk",
      status: opts.status ?? "invited",
    })
    .returning();
  await env.db.insert(staffInvite).values({
    organizationId: env.base.orgId,
    staffUserId: staff?.id ?? "",
    tokenHash: hashToken(opts.token ?? "invite-token"),
    expiresAt: new Date(Date.now() + (opts.expiresInMs ?? 7 * DAY)),
    acceptedAt: opts.acceptedAt ?? null,
    createdBy: env.base.staff.owner,
  });
}
const get = (token: string | null) =>
  GET(new Request(`https://petbooking.test/api/v1/auth/staff/invite${token === null ? "" : `?token=${encodeURIComponent(token)}`}`), {
    params: Promise.resolve({}),
  });
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

it("returns the shop name, invited role and whether the invite has an email, without creating a session", async () => {
  await seedInvite();
  const response = await get("invite-token");
  expect(response.status).toBe(200);
  expect(AuthInvitePreviewResponse.parse(await response.json())).toEqual({ orgName: "Shop a", role: "front_desk", hasEmail: true });
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(await env.db.select().from(session)).toEqual([]);
});

it("reports hasEmail = false for a LINE-only invite", async () => {
  await seedInvite({ email: null, role: "staff", token: "line-only" });
  expect(await (await get("line-only")).json()).toEqual({ orgName: "Shop a", role: "staff", hasEmail: false });
});

it("answers TOKEN_INVALID for an unknown, expired, accepted or no-longer-invited token", async () => {
  await seedInvite({ token: "expired", expiresInMs: -1 });
  await seedInvite({ token: "accepted", acceptedAt: new Date(), email: "x@a.test" });
  await seedInvite({ token: "active", status: "active", email: "y@a.test" });
  for (const token of ["nope", "expired", "accepted", "active"]) {
    const response = await get(token);
    expect(response.status, token).toBe(400);
    expect(await code(response)).toBe("TOKEN_INVALID");
  }
});

it("rejects a missing token with VALIDATION_FAILED", async () => {
  const response = await get(null);
  expect(response.status).toBe(422);
  expect(await code(response)).toBe("VALIDATION_FAILED");
});

it("reads another organization's invite only through its own token", async () => {
  const other = await otherOrg(env.db);
  const [staff] = await env.db
    .insert(staffUser)
    .values({ organizationId: other.orgId, email: "b@b.test", displayName: "b", role: "owner", status: "invited" })
    .returning();
  await env.db.insert(staffInvite).values({
    organizationId: other.orgId,
    staffUserId: staff?.id ?? "",
    tokenHash: hashToken("other-token"),
    expiresAt: new Date(Date.now() + DAY),
    createdBy: other.staff.owner,
  });
  expect(await (await get("other-token")).json()).toEqual({ orgName: "Shop b", role: "owner", hasEmail: true });
  expect(
    (
      await env.db
        .select()
        .from(staffUser)
        .where(eq(staffUser.id, staff?.id ?? ""))
    )[0]?.status,
  ).toBe("invited");
});
