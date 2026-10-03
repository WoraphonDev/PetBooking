import { readFileSync } from "node:fs";
import { CustomersTimelineQuery, CustomersTimelineRequest, CustomersTimelineResponse } from "@app/contracts/endpoints/customers.timeline";
import { bill, booking, bookingEvent, groomAppointment, groomStation, pet, reportCard } from "@app/db/schema";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSession } from "../../../src/auth/session.ts";
import { withStaff } from "../../../src/http/wrap.ts";
import { customersTimeline, STATUS_LABELS } from "../../../src/services/customers/timeline.ts";
import { otherOrg, type SeedOrg, setupTestDb, type TestEnv } from "../../helpers/setup.ts";

const GET = withStaff("customers.timeline", { params: CustomersTimelineRequest, query: CustomersTimelineQuery }, customersTimeline);
let env: TestEnv;
let foreign: SeedOrg;
const ids: Record<string, string> = {};
const at = (day: number, hour = 3) => new Date(Date.UTC(2026, 8, day, hour));

beforeAll(async () => {
  env = await setupTestDb();
  foreign = await otherOrg(env.db);
  const org = env.base;
  const tenant = { organizationId: org.orgId, branchId: org.branchId };
  const [mochi] = await env.db
    .insert(pet)
    .values({ ownerProfileId: org.ownerProfileId, createdInOrgId: org.orgId, name: "Mochi", species: "dog" })
    .returning();
  const bookingRow = {
    ...tenant,
    channel: "walk_in" as const,
    createdByType: "staff" as const,
    policySnapshot: {},
    status: "confirmed" as const,
  };
  const [bk] = await env.db
    .insert(booking)
    .values({ ...bookingRow, customerId: org.customerId, bookingNo: "B6909-0001", depositStatus: "verified" })
    .returning();
  const [foreignBk] = await env.db
    .insert(booking)
    .values({
      ...bookingRow,
      ...{ organizationId: foreign.orgId, branchId: foreign.branchId },
      customerId: foreign.customerId,
      bookingNo: "B6909-0002",
    })
    .returning();
  const [station] = await env.db
    .insert(groomStation)
    .values({ ...tenant, name: "T1" })
    .returning();
  const [appt] = await env.db
    .insert(groomAppointment)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: mochi?.id ?? "",
      groomerId: org.staff.staff,
      stationId: station?.id ?? "",
      groomerPreference: "any",
      startsAt: at(2),
      endsAt: at(2, 4),
      blockedUntil: at(2, 4),
      status: "checked_in",
    })
    .returning();
  const [later] = await env.db
    .insert(groomAppointment)
    .values({
      ...tenant,
      bookingId: bk?.id ?? "",
      petId: mochi?.id ?? "",
      groomerId: org.staff.staff,
      stationId: station?.id ?? "",
      groomerPreference: "any",
      startsAt: at(8),
      endsAt: at(8, 4),
      blockedUntil: at(8, 4),
      status: "done",
    })
    .returning();
  Object.assign(ids, { booking: bk?.id, appt: appt?.id, mochi: mochi?.id });
  const event = (
    entityType: "booking" | "deposit" | "groom_appointment",
    entityId: string,
    from: string | null,
    to: string,
    createdAt: Date,
  ) => ({
    organizationId: org.orgId,
    bookingId: bk?.id ?? "",
    entityType,
    entityId,
    fromStatus: from,
    toStatus: to,
    actorType: "staff" as const,
    actorId: org.staff.owner,
    createdAt,
  });
  await env.db.insert(bookingEvent).values([
    event("booking", bk?.id ?? "", null, "confirmed", at(1)),
    event("deposit", bk?.id ?? "", "pending", "verified", at(1, 5)),
    event("groom_appointment", appt?.id ?? "", "scheduled", "checked_in", at(2)),
    {
      organizationId: foreign.orgId,
      bookingId: foreignBk?.id ?? "",
      entityType: "booking" as const,
      entityId: foreignBk?.id ?? "",
      fromStatus: null,
      toStatus: "confirmed",
      actorType: "staff" as const,
      actorId: foreign.staff.owner,
      createdAt: at(3),
    },
  ]);
  const bills = await env.db
    .insert(bill)
    .values([
      {
        ...tenant,
        customerId: org.customerId,
        openedBy: org.staff.owner,
        receiptNo: "R6909-0001",
        status: "paid",
        subtotalSatang: 50_000,
        totalSatang: 50_000,
        paidSatang: 50_000,
        closedAt: at(4),
      },
      {
        ...tenant,
        customerId: org.customerId,
        openedBy: org.staff.owner,
        receiptNo: "R6909-0002",
        status: "void",
        subtotalSatang: 20_000,
        totalSatang: 20_000,
        closedAt: at(5),
        voidedAt: at(6),
      },
      { ...tenant, customerId: org.customerId, openedBy: org.staff.owner, status: "open", subtotalSatang: 9_900, totalSatang: 9_900 },
    ])
    .returning();
  Object.assign(ids, { paid: bills[0]?.id, void: bills[1]?.id });
  const card = {
    ...tenant,
    kind: "grooming" as const,
    petId: mochi?.id ?? "",
    customerId: org.customerId,
    appointmentId: appt?.id,
    createdBy: org.staff.staff,
  };
  const [sent] = await env.db
    .insert(reportCard)
    .values([
      { ...card, status: "sent", sentAt: at(7) },
      { ...card, appointmentId: later?.id, status: "draft" },
    ])
    .returning();
  ids.card = sent?.id ?? "";
});
afterAll(() => env.close());

async function get(customerId: string, query = "", role: "owner" | "front_desk" | "staff" = "front_desk", org: SeedOrg = env.base) {
  const login = await createSession(
    env.db,
    { subjectType: "staff", subjectId: org.staff[role], organizationId: org.orgId, branchId: org.branchId },
    new Date(),
  );
  return GET(
    new Request(`https://petbooking.test/api/v1/staff/customers/${customerId}/timeline${query}`, {
      headers: { cookie: `sid=${login.token}` },
    }),
    { params: Promise.resolve({ customerId }) },
  );
}

it.each(["owner", "front_desk"] as const)(
  "merges booking events, paid/void bills and sent report cards newest first for %s",
  async (role) => {
    const response = await get(env.base.customerId, "", role);
    expect(response.status).toBe(200);
    const body = CustomersTimelineResponse.parse(await response.json());
    expect(body.nextCursor).toBeNull();
    expect(body.items).toEqual([
      { at: at(7).toISOString(), type: "report_card", title: "ส่งแล้ว", petName: "Mochi", amountSatang: null, refId: ids.card },
      { at: at(6).toISOString(), type: "bill", title: "R6909-0002 · ยกเลิก", petName: null, amountSatang: 20_000, refId: ids.void },
      { at: at(5).toISOString(), type: "bill", title: "R6909-0002 · ชำระแล้ว", petName: null, amountSatang: 20_000, refId: ids.void },
      { at: at(4).toISOString(), type: "bill", title: "R6909-0001 · ชำระแล้ว", petName: null, amountSatang: 50_000, refId: ids.paid },
      { at: at(2).toISOString(), type: "groom", title: "B6909-0001 · มาถึงแล้ว", petName: "Mochi", amountSatang: null, refId: ids.appt },
      {
        at: at(1, 5).toISOString(),
        type: "booking",
        title: "B6909-0001 · รับมัดจำแล้ว",
        petName: null,
        amountSatang: null,
        refId: ids.booking,
      },
      { at: at(1).toISOString(), type: "booking", title: "B6909-0001 · ยืนยันแล้ว", petName: null, amountSatang: null, refId: ids.booking },
    ]);
  },
);

it("pages with an opaque cursor without gaps or repeats", async () => {
  const first = CustomersTimelineResponse.parse(await (await get(env.base.customerId, "?limit=3")).json());
  expect(first.items).toHaveLength(3);
  expect(first.nextCursor).not.toBeNull();
  const second = CustomersTimelineResponse.parse(await (await get(env.base.customerId, `?limit=3&cursor=${first.nextCursor}`)).json());
  const third = CustomersTimelineResponse.parse(await (await get(env.base.customerId, `?limit=3&cursor=${second.nextCursor}`)).json());
  expect(third.nextCursor).toBeNull();
  const all = [...first.items, ...second.items, ...third.items].map((i) => `${i.at}|${i.title}`);
  expect(all).toHaveLength(7);
  expect(new Set(all).size).toBe(7);
});

it("rejects a malformed customerId, cursor or limit with VALIDATION_FAILED", async () => {
  for (const [id, query] of [
    ["not-a-uuid", ""],
    [env.base.customerId, "?cursor=bm9wZQ"],
    [env.base.customerId, "?limit=500"],
  ] as const) {
    const response = await get(id, query);
    expect(response.status).toBe(422);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("VALIDATION_FAILED");
  }
});

it("forbids the staff role", async () => {
  const response = await get(env.base.customerId, "", "staff");
  expect(response.status).toBe(403);
  expect(((await response.json()) as { error: { code: string } }).error.code).toBe("FORBIDDEN");
});

it("answers NOT_FOUND for another organization's customer", async () => {
  const response = await get(foreign.customerId);
  expect(response.status).toBe(404);
  expect(((await response.json()) as { error: { code: string } }).error.code).toBe("NOT_FOUND");
});

it("keeps the status labels identical to docs/spec/enum-labels.th.json", () => {
  const spec = JSON.parse(readFileSync(new URL("../../../../../docs/spec/enum-labels.th.json", import.meta.url), "utf8")).enum;
  for (const [key, labels] of Object.entries(STATUS_LABELS)) expect(labels, key).toEqual(spec[key]);
});
