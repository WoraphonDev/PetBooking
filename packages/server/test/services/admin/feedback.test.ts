import { AdminFeedbackRequest, AdminFeedbackResponse } from "@app/contracts/endpoints/admin.feedback";
import { feedbackReport, platformAdmin } from "@app/db/schema";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withAdmin } from "../../../src/http.ts";
import { adminFeedback } from "../../../src/services/admin/feedback.ts";
import { otherOrg, setupTestDb, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let token: string;
const GET = withAdmin("admin.feedback", { query: AdminFeedbackRequest }, adminFeedback);
const get = (qs = "", cookie = `aid=${token}`) =>
  GET(new Request(`https://petbooking.test/api/v1/admin/feedback${qs}`, { headers: { cookie } }));

beforeEach(async () => {
  env = await setupTestDb();
  const [admin] = await env.db
    .insert(platformAdmin)
    .values({ email: "admin@example.test", displayName: "Admin", passwordHash: "x" })
    .returning();
  token = (await createSession(env.db, { subjectType: "platform_admin", subjectId: admin?.id ?? "" }, TEST_NOW)).token;
});
afterEach(async () => {
  await env.close();
});

it("lists every shop's reports with every FeedbackItem field, newest first", async () => {
  const foreign = await otherOrg(env.db);
  const [older, newer] = await env.db
    .insert(feedbackReport)
    .values([
      {
        organizationId: env.base.orgId,
        staffUserId: env.base.staff.front_desk,
        pageUrl: "/console/calendar",
        message: "ปฏิทินโหลดช้า",
        appVersion: "1.2.3",
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
      },
      {
        organizationId: foreign.orgId,
        staffUserId: foreign.staff.owner,
        pageUrl: "/console",
        message: "อยากได้รายงานรายเดือน",
        status: "acknowledged",
        createdAt: new Date("2026-10-02T00:00:00.000Z"),
      },
    ])
    .returning();
  const response = await get();
  expect(response.status).toBe(200);
  expect(AdminFeedbackResponse.parse(await response.json())).toEqual([
    {
      id: newer?.id,
      orgName: "Shop b",
      staffName: "owner",
      pageUrl: "/console",
      message: "อยากได้รายงานรายเดือน",
      screenshotUrl: null,
      appVersion: null,
      status: "acknowledged",
      createdAt: "2026-10-02T00:00:00.000Z",
    },
    {
      id: older?.id,
      orgName: "Shop a",
      staffName: "front_desk",
      pageUrl: "/console/calendar",
      message: "ปฏิทินโหลดช้า",
      screenshotUrl: null,
      appVersion: "1.2.3",
      status: "new",
      createdAt: "2026-10-01T00:00:00.000Z",
    },
  ]);
});

it("returns an empty list when nothing was reported", async () => {
  const response = await get();
  expect(await response.json()).toEqual([]);
});

it("rejects unknown query parameters with VALIDATION_FAILED", async () => {
  const response = await get("?status=new");
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});

it("is not open to a staff session", async () => {
  const staff = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.owner, organizationId: env.base.orgId, branchId: env.base.branchId },
    TEST_NOW,
  );
  expect((await get("", `sid=${staff.token}`)).status).toBe(401);
});
