import { FeedbackCreateRequest } from "@app/contracts/endpoints/feedback.create";
import { feedbackReport, fileObject, notification, organization, platformAdmin } from "@app/db/schema";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { resetRateLimits, withStaff } from "../../../src/http.ts";
import { createFakeStorage, setStorage } from "../../../src/integrations/storage/index.ts";
import { feedbackCreate } from "../../../src/services/feedback/create.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const ROUTE = withStaff("feedback.create", { body: FeedbackCreateRequest }, feedbackCreate);
let env: TestEnv;
let other: SeedOrg;
let storage: ReturnType<typeof createFakeStorage>;
let seq = 0;
const admins: string[] = [];
beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  other = await otherOrg(env.db);
  const rows = await env.db
    .insert(platformAdmin)
    .values([
      { email: "ops1@example.test", displayName: "Ops 1", passwordHash: "test-only" },
      { email: "ops2@example.test", displayName: "Ops 2", passwordHash: "test-only" },
      { email: "gone@example.test", displayName: "Gone", passwordHash: "test-only", status: "disabled" },
    ])
    .returning();
  admins.push(...rows.slice(0, 2).map((r) => r.id));
});
afterAll(async () => {
  setStorage(null);
  vi.unstubAllEnvs();
  await env.close();
});
beforeEach(() => {
  storage = createFakeStorage();
  setStorage(storage);
  resetRateLimits();
});

async function upload(kind: typeof fileObject.$inferInsert.kind = "feedback", org: SeedOrg = env.base) {
  const [f] = await env.db
    .insert(fileObject)
    .values({
      organizationId: org.orgId,
      kind,
      storageKey: `org/x/${kind}/f${++seq}.png`,
      mimeType: "image/png",
      sizeBytes: 100,
      uploadedByType: "staff",
    })
    .returning();
  storage.put(f?.storageKey ?? "", { sizeBytes: 100, contentType: "image/png" });
  return f?.id ?? "";
}
async function post(body: unknown, role: "owner" | "front_desk" | "staff" = "staff", org: SeedOrg = env.base) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: org.staff[role], organizationId: org.orgId, branchId: org.branchId },
    new Date(),
  );
  return ROUTE(
    new Request("https://petbooking.test/api/v1/staff/feedback", {
      method: "POST",
      headers: { cookie: `sid=${login.token}`, origin: "https://petbooking.test" },
      body: JSON.stringify(body),
    }),
    { params: {} },
  );
}
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const reportsOf = (staffUserId: string) => env.db.select().from(feedbackReport).where(eq(feedbackReport.staffUserId, staffUserId));

it("204: stores the report with the committed screenshot and tells every active platform admin (role staff)", async () => {
  const shot = await upload();
  const res = await post({ pageUrl: "/staff/queue", message: "ปุ่มเริ่มงานกดไม่ได้", screenshotFileId: shot, appVersion: "abc1234" });
  expect(res.status).toBe(204);
  expect(await res.text()).toBe("");
  const [report] = await reportsOf(env.base.staff.staff);
  expect(report).toMatchObject({
    organizationId: env.base.orgId,
    pageUrl: "/staff/queue",
    message: "ปุ่มเริ่มงานกดไม่ได้",
    screenshotFileId: shot,
    appVersion: "abc1234",
    status: "new",
  });
  expect((await env.db.select().from(fileObject).where(eq(fileObject.id, shot)))[0]?.committedAt).not.toBeNull();
  const notes = await env.db
    .select()
    .from(notification)
    .where(like(notification.dedupeKey, `feedback:${report?.id}:%`));
  const [org] = await env.db.select().from(organization).where(eq(organization.id, env.base.orgId));
  expect(notes.map((x) => x.recipientId).sort()).toEqual([...admins].sort());
  expect(notes[0]).toMatchObject({
    templateKey: "admin.feedback",
    recipientType: "platform_admin",
    organizationId: env.base.orgId,
    channel: "email",
    payload: { shopName: org?.name, message: "ปุ่มเริ่มงานกดไม่ได้" },
  });
});

it("without a screenshot or version (owner and front_desk may send too)", async () => {
  for (const role of ["owner", "front_desk"] as const) {
    expect((await post({ pageUrl: "/console", message: "หน้าโหลดช้ามาก" }, role)).status).toBe(204);
    expect(await reportsOf(env.base.staff[role])).toEqual([expect.objectContaining({ screenshotFileId: null, appVersion: null })]);
  }
});

it.each([
  ["missing pageUrl", { message: "หน้าโหลดช้ามาก" }],
  ["message shorter than 5", { pageUrl: "/x", message: "ช้า" }],
  ["message over 2000", { pageUrl: "/x", message: "ก".repeat(2001) }],
  ["screenshot not a uuid", { pageUrl: "/x", message: "หน้าโหลดช้ามาก", screenshotFileId: "x" }],
])("VALIDATION_FAILED: %s", async (_n, body) => {
  expect(await codeOf(await post(body))).toBe("VALIDATION_FAILED");
});

it("a screenshot of another kind → VALIDATION_FAILED; another org's file → NOT_FOUND; nothing stored", async () => {
  const before = (await reportsOf(env.base.staff.staff)).length;
  expect(await codeOf(await post({ pageUrl: "/x", message: "หน้าโหลดช้ามาก", screenshotFileId: await upload("slip") }))).toBe(
    "VALIDATION_FAILED",
  );
  expect(await codeOf(await post({ pageUrl: "/x", message: "หน้าโหลดช้ามาก", screenshotFileId: await upload("feedback", other) }))).toBe(
    "NOT_FOUND",
  );
  expect(await reportsOf(env.base.staff.staff)).toHaveLength(before);
});
