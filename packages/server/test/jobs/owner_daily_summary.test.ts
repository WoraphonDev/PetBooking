import {
  booking,
  daycareSessionType,
  daycareVisit,
  groomAppointment,
  groomStation,
  notification,
  payment,
  pet,
  roomType,
  roomUnit,
  scheduledJob,
  staffUser,
  stay,
} from "@app/db/schema";
import { afterAll, beforeAll, expect, it } from "vitest";
import { makeSystemCtx } from "../../src/context.ts";
import { withTx } from "../../src/db.ts";
import { handler } from "../../src/jobs/handlers/owner_daily_summary.ts";
import { runJobs } from "../../src/jobs/runner.ts";
import { otherOrg, type SeedOrg, setupTestDb, TEST_NOW, type TestEnv } from "../helpers/setup.ts";

let env: TestEnv;
let other: SeedOrg;
const owners: string[] = [];
// TEST_NOW = 2026-10-05 10:00 Asia/Bangkok
const bkk = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);

beforeAll(async () => {
  env = await setupTestDb();
  other = await otherOrg(env.db);
  const org = env.base;
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [second, disabled] = await env.db
    .insert(staffUser)
    .values([
      { organizationId: org.orgId, displayName: "owner2", role: "owner", status: "active" },
      { organizationId: org.orgId, displayName: "owner3", role: "owner", status: "disabled" },
    ])
    .returning();
  owners.push(org.staff.owner, second?.id ?? "");
  expect(disabled?.status).toBe("disabled");

  const [bk] = await env.db
    .insert(booking)
    .values({
      ...tenant,
      customerId: org.customerId,
      channel: "walk_in",
      bookingNo: "B6910-0001",
      createdByType: "staff",
      policySnapshot: {},
      status: "confirmed",
      depositStatus: "not_required",
    })
    .returning();
  const [p] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "มะลิ", species: "dog" })
    .returning();
  const base = { ...tenant, bookingId: bk?.id ?? "", petId: p?.id ?? "" };
  const [station] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: "T1" })
    .returning();
  const groom = (date: string, time: string, status: "scheduled" | "no_show" | "cancelled" | "done") => {
    const startsAt = bkk(date, time);
    const end = new Date(startsAt.getTime() + 3_600_000);
    return {
      ...base,
      groomerId: org.staff.staff,
      stationId: station?.id ?? "",
      groomerPreference: "any" as const,
      startsAt,
      endsAt: end,
      blockedUntil: end,
      status,
    };
  };
  await env.db
    .insert(groomAppointment)
    .values([
      groom("2026-10-05", "09:00", "no_show"),
      groom("2026-10-05", "11:00", "done"),
      groom("2026-10-05", "13:00", "cancelled"),
      groom("2026-10-04", "11:00", "done"),
      groom("2026-10-06", "11:00", "scheduled"),
      groom("2026-10-06", "13:00", "cancelled"),
    ]);

  const [type] = await env.db
    .insert(roomType)
    .values({ ...tenant, nameTh: "Room" })
    .returning();
  const units = await env.db
    .insert(roomUnit)
    .values(["R1", "R2"].map((code) => ({ ...tenant, roomTypeId: type?.id ?? "", code })))
    .returning();
  const stayRow = (unit: number, checkInDate: string, checkOutDate: string, status: "checked_in" | "reserved") => ({
    ...base,
    roomTypeId: type?.id ?? "",
    roomUnitId: units[unit]?.id ?? "",
    checkInDate,
    checkOutDate,
    nights: 2,
    nightlyPriceSatang: 50000,
    roomTotalSatang: 100000,
    status,
  });
  await env.db
    .insert(stay)
    .values([stayRow(0, "2026-10-04", "2026-10-06", "checked_in"), stayRow(1, "2026-10-06", "2026-10-08", "reserved")]);
  const [session] = await env.db
    .insert(daycareSessionType)
    .values({ ...tenant, session: "full_day", nameTh: "Day", startsAt: "09:00", endsAt: "18:00", capacity: 10 })
    .returning();
  await env.db
    .insert(daycareVisit)
    .values({ ...base, sessionTypeId: session?.id ?? "", visitDate: "2026-10-06", priceSatang: 30000, status: "reserved" });

  const pay = (
    method: "cash" | "promptpay" | "deposit",
    amountSatang: number,
    receivedAt: Date,
    status: "posted" | "voided" = "posted",
  ) => ({
    ...tenant,
    bookingId: bk?.id ?? "",
    method,
    amountSatang,
    receivedAt,
    status,
  });
  await env.db
    .insert(payment)
    .values([
      pay("cash", 50000, bkk("2026-10-05", "09:30")),
      pay("promptpay", 25050, bkk("2026-10-05", "19:59")),
      pay("deposit", 10000, bkk("2026-10-05", "10:00")),
      pay("cash", 7000, bkk("2026-10-05", "11:00"), "voided"),
      pay("cash", 9900, bkk("2026-10-04", "23:59")),
    ]);
});
afterAll(() => env.close());

const summaries = () =>
  env.db
    .select()
    .from(notification)
    .then((rows) => rows.filter((r) => r.templateKey === "owner.daily_summary"));

it("sends the day's numbers to every active owner once, even when the job runs after midnight", async () => {
  await env.db.insert(scheduledJob).values({
    organizationId: env.base.orgId,
    jobType: "owner_daily_summary",
    runAt: TEST_NOW,
    payload: { branchId: env.base.branchId, localDate: "2026-10-05" },
    dedupeKey: `owner_daily_summary:${env.base.branchId}:2026-10-05`,
  });
  // retried late: 00:30 local the next day
  const late = makeSystemCtx(null, bkk("2026-10-06", "00:30"));
  expect(await runJobs(late, { owner_daily_summary: handler })).toEqual({ processed: 1, failed: 0 });

  const rows = await summaries();
  expect(rows.map((r) => r.recipientId).sort()).toEqual([...owners].sort());
  for (const row of rows)
    expect(row).toMatchObject({
      organizationId: env.base.orgId,
      branchId: env.base.branchId,
      recipientType: "staff",
      dedupeKey: `daily_summary:${env.base.branchId}:2026-10-05:${row.recipientId}`,
      payload: { date: "5 ต.ค. 2569", groomCount: 2, staysInHouse: 1, salesTotal: "฿750.50", noShows: 1, tomorrowCount: 3 },
      status: "queued",
    });

  const ctx = makeSystemCtx(env.base.orgId, TEST_NOW);
  const [job] = await env.db.select().from(scheduledJob);
  if (!job) throw new Error("missing job");
  await withTx(ctx, (tx) => handler(tx, ctx, job));
  expect(await summaries()).toHaveLength(2);
});

it("does nothing for a branch outside the job's organization", async () => {
  const before = (await summaries()).length;
  const ctx = makeSystemCtx(env.base.orgId, TEST_NOW);
  const [job] = await env.db
    .insert(scheduledJob)
    .values({
      organizationId: env.base.orgId,
      jobType: "owner_daily_summary",
      runAt: TEST_NOW,
      payload: { branchId: other.branchId, localDate: "2026-10-05" },
      dedupeKey: `owner_daily_summary:${other.branchId}:2026-10-05`,
    })
    .returning();
  if (!job) throw new Error("missing job");
  await withTx(ctx, (tx) => handler(tx, ctx, job));
  expect(await summaries()).toHaveLength(before);
});
