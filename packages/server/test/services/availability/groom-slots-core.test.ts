import { booking, branch, branchHours, branchPolicy, groomAppointment, groomStation, pet, staffUser, staffWorkingHours } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { groomDaySlots } from "../../../src/services/availability/groom-slots-core.ts";
import { otherOrg, setupTestDb, staffCtx, type TestEnv } from "../../helpers/setup.ts";

// Saturdays (weekday 6), Asia/Bangkok: 09:00 = 02:00Z … 12:00 = 05:00Z; TEST_NOW is 2026-10-05 (default horizon 60 days)
const DATE = "2026-10-10";
const FAR = "2026-12-26"; // a Saturday 82 days ahead, past the 60-day horizon
const at = (hhmm: string, date = DATE) => `${date}T${String(Number(hhmm.slice(0, 2)) - 7).padStart(2, "0")}:${hhmm.slice(3)}:00.000Z`;
let env: TestEnv;
let b: { id: string; timezone: string };
const ids: Record<string, string> = {};

beforeAll(async () => {
  env = await setupTestDb();
  const org = env.base;
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [row] = await env.db.select().from(branch).where(eq(branch.id, org.branchId));
  b = { id: row?.id ?? "", timezone: row?.timezone ?? "" };
  await env.db.insert(branchHours).values({ branchId: org.branchId, weekday: 6, isClosed: false, opensAt: "09:00", closesAt: "12:00" });
  await env.db.insert(branchPolicy).values({ branchId: org.branchId, slotStepMinutes: 30, bufferMinutes: 0 });
  const [t1, t2] = await env.db
    .insert(groomStation)
    .values([
      { ...tenant, name: "T1", sortOrder: 1 },
      { ...tenant, name: "T2", sortOrder: 2 },
    ])
    .returning();
  ids.t1 = t1?.id ?? "";
  ids.t2 = t2?.id ?? "";
  await env.db.update(staffUser).set({ isGroomer: true, sortOrder: 1 }).where(eq(staffUser.id, org.staff.staff));
  await env.db.update(staffUser).set({ isGroomer: true, sortOrder: 2 }).where(eq(staffUser.id, org.staff.owner));
  await env.db
    .insert(staffWorkingHours)
    .values(
      [org.staff.staff, org.staff.owner].map((staffUserId) => ({ ...tenant, staffUserId, weekday: 6, startsAt: "09:00", endsAt: "12:00" })),
    );
  const [mochi] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "Mochi", species: "dog", latestWeightGrams: 4_000 })
    .returning();
  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      bookingNo: "G-1",
      channel: "walk_in",
      createdByType: "staff",
      status: "confirmed",
      policySnapshot: {},
    })
    .returning();
  // the staff groomer is booked 10:00–11:00 on T1
  const [busy] = await env.db
    .insert(groomAppointment)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: mochi?.id ?? "",
      groomerId: org.staff.staff,
      stationId: ids.t1,
      startsAt: new Date(at("10:00")),
      endsAt: new Date(at("11:00")),
      blockedUntil: new Date(at("11:00")),
    })
    .returning();
  ids.busy = busy?.id ?? "";
});
afterAll(async () => {
  await env.close();
});

const ctx = () => staffCtx(env.base, "owner");
const day = (extra: Partial<Parameters<typeof groomDaySlots>[2]> = {}) =>
  groomDaySlots(ctx(), env.db, { branch: b, date: DATE, channel: "staff", durationMinutes: 60, ...extra });
const picks = (r: Awaited<ReturnType<typeof groomDaySlots>>) =>
  r.slots.map((s) => [s.startsAt.slice(11, 16), s.groomerId === env.base.staff.staff ? "staff" : "owner", s.stationId === ids.t1 ? "T1" : "T2"]);

it("loads the day and runs R-04: saved appointments block their groomer and station", async () => {
  const r = await day();
  expect(r.reason).toBe("ok");
  // 60 min from 09:00 to 11:00 every 30 min, always the least-loaded groomer (owner); starts that overlap the
  // 10:00–11:00 hold on T1 (09:30, 10:00, 10:30) move to T2
  expect(picks(r)).toEqual([
    ["02:00", "owner", "T1"],
    ["02:30", "owner", "T2"],
    ["03:00", "owner", "T2"],
    ["03:30", "owner", "T2"],
    ["04:00", "owner", "T1"],
  ]);
  expect(r.slots[0]).toMatchObject({ endsAt: at("10:00"), groomerName: expect.any(String) });
});

it("pendingAppointments hold their groomer and station like saved ones", async () => {
  const pending = [{ groomerId: env.base.staff.owner, stationId: ids.t2, startsAt: at("10:00"), blockedUntil: at("11:00") }];
  const r = await day({ pendingAppointments: pending });
  // 09:30–10:30 starts: both groomers and both stations are now taken
  expect(picks(r).map(([start]) => start)).toEqual(["02:00", "04:00"]);
  const specific = await day({ groomerId: env.base.staff.owner, pendingAppointments: pending });
  expect(picks(specific).map(([start]) => start)).toEqual(["02:00", "04:00"]);
});

it("excludeAppointmentId frees that appointment's groomer and station", async () => {
  const r = await day({ groomerId: env.base.staff.staff, excludeAppointmentId: ids.busy });
  expect(picks(r)).toEqual([
    ["02:00", "staff", "T1"],
    ["02:30", "staff", "T1"],
    ["03:00", "staff", "T1"],
    ["03:30", "staff", "T1"],
    ["04:00", "staff", "T1"],
  ]);
  const kept = await day({ groomerId: env.base.staff.staff });
  expect(picks(kept).map(([start]) => start)).toEqual(["02:00", "04:00"]);
});

it("channel: online applies the booking window, staff does not", async () => {
  expect((await day({ date: FAR, channel: "online" })).reason).toBe("beyond_horizon");
  const staff = await day({ date: FAR, channel: "staff" });
  expect(staff.reason).toBe("ok");
  expect(staff.slots.length).toBeGreaterThan(0);
});

it("a groomer of another organization → NOT_FOUND", async () => {
  const foreign = await otherOrg(env.db);
  await expect(day({ groomerId: foreign.staff.owner })).rejects.toMatchObject({ code: "NOT_FOUND" });
});
