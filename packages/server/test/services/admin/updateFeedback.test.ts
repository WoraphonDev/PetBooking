import {
  AdminUpdateFeedbackParams,
  AdminUpdateFeedbackRequest,
  AdminUpdateFeedbackResponse,
} from "@app/contracts/endpoints/admin.updateFeedback";
import { feedbackReport, platformAdmin } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { makeSystemCtx } from "../../../src/context.ts";
import { resetRateLimits, withAdmin } from "../../../src/http.ts";
import { adminUpdateFeedback } from "../../../src/services/admin/updateFeedback.ts";
import { setupTestDb, staffCtx, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let adminId: string;
let token: string;
let feedbackId: string;
const PATCH = withAdmin(
  "admin.updateFeedback",
  { body: AdminUpdateFeedbackRequest, params: AdminUpdateFeedbackParams },
  adminUpdateFeedback,
);
const patch = (id: string, body: unknown, cookie = `aid=${token}`) =>
  PATCH(
    new Request(`https://petbooking.test/api/v1/admin/feedback/${id}`, {
      method: "PATCH",
      headers: { origin: "https://petbooking.test", "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ feedbackId: id }) },
  );

beforeEach(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  resetRateLimits();
  const [admin] = await env.db
    .insert(platformAdmin)
    .values({ email: "admin@example.test", displayName: "Admin", passwordHash: "x" })
    .returning();
  adminId = admin?.id ?? "";
  token = (await createSession(env.db, { subjectType: "platform_admin", subjectId: adminId }, TEST_NOW)).token;
  const [row] = await env.db
    .insert(feedbackReport)
    .values({
      organizationId: env.base.orgId,
      staffUserId: env.base.staff.front_desk,
      pageUrl: "/console/calendar",
      message: "ปฏิทินโหลดช้า",
      appVersion: "1.2.3",
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
    })
    .returning();
  feedbackId = row?.id ?? "";
});
afterEach(async () => {
  await env.close();
  vi.unstubAllEnvs();
});

it("sets the status and returns every FeedbackItem field", async () => {
  for (const status of ["acknowledged", "done", "new"] as const) {
    const response = await patch(feedbackId, { status });
    expect(response.status).toBe(200);
    expect(AdminUpdateFeedbackResponse.parse(await response.json())).toEqual({
      id: feedbackId,
      orgName: "Shop a",
      staffName: "front_desk",
      pageUrl: "/console/calendar",
      message: "ปฏิทินโหลดช้า",
      screenshotUrl: null,
      appVersion: "1.2.3",
      status,
      createdAt: "2026-10-01T00:00:00.000Z",
    });
    const [row] = await env.db.select().from(feedbackReport).where(eq(feedbackReport.id, feedbackId));
    expect(row?.status).toBe(status);
  }
});

it("stamps ctx.now", async () => {
  await adminUpdateFeedback({ ...makeSystemCtx(null, TEST_NOW), actor: { type: "admin", id: adminId } }, { feedbackId, status: "done" });
  const [row] = await env.db.select().from(feedbackReport).where(eq(feedbackReport.id, feedbackId));
  expect(row?.updatedAt).toEqual(TEST_NOW);
});

it("rejects missing and malformed fields with VALIDATION_FAILED", async () => {
  for (const [id, body] of [
    [feedbackId, {}],
    [feedbackId, { status: "closed" }],
    ["not-a-uuid", { status: "done" }],
  ] as const) {
    const response = await patch(id, body);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  }
  const [row] = await env.db.select().from(feedbackReport).where(eq(feedbackReport.id, feedbackId));
  expect(row?.status).toBe("new");
});

it("returns NOT_FOUND for an unknown report", async () => {
  const response = await patch("00000000-0000-4000-8000-000000000000", { status: "done" });
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
});

it("is not open to staff", async () => {
  const staff = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.owner, organizationId: env.base.orgId, branchId: env.base.branchId },
    TEST_NOW,
  );
  expect((await patch(feedbackId, { status: "done" }, `sid=${staff.token}`)).status).toBe(401);
  await expect(adminUpdateFeedback(staffCtx(env.base, "owner"), { feedbackId, status: "done" })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
