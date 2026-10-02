import { AdminListHolidaysParams, AdminListHolidaysResponse } from "@app/contracts/endpoints/admin.listHolidays";
import { platformAdmin, publicHoliday } from "@app/db/schema";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withAdmin } from "../../../src/http.ts";
import { adminListHolidays } from "../../../src/services/admin/listHolidays.ts";
import { setupTestDb, type TestEnv } from "../../helpers/setup.ts";

let env: TestEnv;
let cookie: string;
const GET = withAdmin("admin.listHolidays", { params: AdminListHolidaysParams }, adminListHolidays);
beforeAll(async () => {
  env = await setupTestDb();
  const [admin] = await env.db
    .insert(platformAdmin)
    .values({ email: "holiday@example.test", displayName: "Admin", passwordHash: "unused" })
    .returning();
  cookie = `aid=${(await createSession(env.db, { subjectType: "platform_admin", subjectId: admin?.id ?? "" }, new Date())).token}`;
  await env.db.insert(publicHoliday).values([
    { holidayDate: "2026-12-31", nameTh: "วันสิ้นปี" },
    { holidayDate: "2026-01-01", nameTh: "วันขึ้นปีใหม่" },
    { holidayDate: "2027-01-01", nameTh: "ปีถัดไป" },
  ]);
});
afterAll(async () => {
  await env.close();
});
const get = (year: string, c = cookie) =>
  GET(new Request(`https://petbooking.test/api/v1/admin/public-holidays/${year}`, { headers: { cookie: c } }), {
    params: Promise.resolve({ year }),
  });
it("loads every day of only the chosen year in date order without storage-only fields", async () => {
  const response = await get("2026");
  expect(response.status).toBe(200);
  expect(AdminListHolidaysResponse.parse(await response.json())).toEqual([
    { date: "2026-01-01", nameTh: "วันขึ้นปีใหม่" },
    { date: "2026-12-31", nameTh: "วันสิ้นปี" },
  ]);
  expect(await (await get("2025")).json()).toEqual([]);
  expect(await (await get("2027")).json()).toEqual([{ date: "2027-01-01", nameTh: "ปีถัดไป" }]);
  expect(await env.db.select().from(publicHoliday)).toHaveLength(3);
});
it.each(["bad", "999", "10000", "2026.5"])("rejects invalid year %s", async (year) => {
  const response = await get(year);
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
});
it("requires an admin session and rejects staff-only access", async () => {
  expect((await get("2026", "")).status).toBe(401);
  const session = await createSession(
    env.db,
    { subjectType: "staff", subjectId: env.base.staff.owner, organizationId: env.base.orgId, branchId: env.base.branchId },
    new Date(),
  );
  expect((await get("2026", `sid=${session.token}`)).status).toBe(401);
});
