import { randomUUID } from "node:crypto";
import { ERROR_HTTP, ERROR_MESSAGE_TH } from "@app/contracts/errors";
import { branch, organization, roomUnit, session, sizeTier, staffUser } from "@app/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError, mapPgError } from "../../src/errors.ts";
import { setupTestDb, type TestEnv } from "../helpers/setup.ts";

let env: TestEnv;
beforeAll(async () => {
  env = await setupTestDb();
});
afterAll(async () => env.close());

/** Runs a failing query through Drizzle (so DrizzleQueryError.cause is unwrapped) and returns the mapped code. */
const mapped = (p: PromiseLike<unknown>) =>
  Promise.resolve(p).then(
    () => "no error",
    (e: unknown) => mapPgError(e).code,
  );

// fixture rows without FK chains: replica role disables FK/user triggers; CHECK + EXCLUDE + UNIQUE stay enforced
async function asReplica<T>(fn: () => Promise<T>): Promise<T> {
  await env.db.execute(sql`set session_replication_role = replica`);
  try {
    return await fn();
  } finally {
    await env.db.execute(sql`set session_replication_role = origin`);
  }
}

const appt = (o: { groomer: string; station: string; starts: string; ends: string }) =>
  env.db.execute(sql`insert into groom_appointment (organization_id, branch_id, booking_id, pet_id, groomer_id, station_id, starts_at, ends_at, blocked_until, status)
    values (${env.base.orgId}, ${env.base.branchId}, ${randomUUID()}, ${randomUUID()}, ${o.groomer}, ${o.station}, ${o.starts}, ${o.ends}, ${o.ends}, 'scheduled')`);
const stay = (o: { room: string; pet: string; from: string; to: string }) =>
  env.db.execute(sql`insert into stay (organization_id, branch_id, booking_id, pet_id, room_type_id, room_unit_id, check_in_date, check_out_date, nights, nightly_price_satang, room_total_satang, status)
    values (${env.base.orgId}, ${env.base.branchId}, ${randomUUID()}, ${o.pet}, ${randomUUID()}, ${o.room}, ${o.from}, ${o.to}, 2, 50000, 100000, 'reserved')`);

describe("mapPgError — exclusion constraints (23P01)", () => {
  it("groom_appt_groomer_no_overlap / groom_appt_station_no_overlap → SLOT_TAKEN", async () => {
    const g = randomUUID();
    const st = randomUUID();
    await asReplica(async () => {
      expect(await mapped(appt({ groomer: g, station: st, starts: "2026-10-05T03:00:00Z", ends: "2026-10-05T04:00:00Z" }))).toBe(
        "no error",
      );
      expect(await mapped(appt({ groomer: g, station: randomUUID(), starts: "2026-10-05T03:30:00Z", ends: "2026-10-05T04:30:00Z" }))).toBe(
        "SLOT_TAKEN",
      );
      expect(await mapped(appt({ groomer: randomUUID(), station: st, starts: "2026-10-05T03:30:00Z", ends: "2026-10-05T04:30:00Z" }))).toBe(
        "SLOT_TAKEN",
      );
    });
  });

  it("stay_room_no_overlap → ROOM_TAKEN, stay_pet_no_overlap → PET_ALREADY_BOOKED", async () => {
    const room = randomUUID();
    const pet = randomUUID();
    await asReplica(async () => {
      expect(await mapped(stay({ room, pet, from: "2026-10-10", to: "2026-10-12" }))).toBe("no error");
      expect(await mapped(stay({ room, pet: randomUUID(), from: "2026-10-11", to: "2026-10-13" }))).toBe("ROOM_TAKEN");
      expect(await mapped(stay({ room: randomUUID(), pet, from: "2026-10-11", to: "2026-10-13" }))).toBe("PET_ALREADY_BOOKED");
    });
  });
});

describe("mapPgError — unique indexes (23505)", () => {
  it("*_slug_uq → SLUG_TAKEN", async () => {
    expect(await mapped(env.db.insert(organization).values({ name: "dup", slug: "shop-a" }))).toBe("SLUG_TAKEN");
    expect(await mapped(env.db.insert(branch).values({ organizationId: env.base.orgId, name: "dup", bookingSlug: "shop-a" }))).toBe(
      "SLUG_TAKEN",
    );
  });

  it("staff_user_email_uq → EMAIL_TAKEN", async () => {
    expect(
      await mapped(
        env.db.insert(staffUser).values({ organizationId: env.base.orgId, email: "owner@a.test", displayName: "x", role: "staff" }),
      ),
    ).toBe("EMAIL_TAKEN");
  });

  it("*_code_uq → CODE_TAKEN", async () => {
    const tier = {
      organizationId: env.base.orgId,
      branchId: env.base.branchId,
      species: "dog" as const,
      code: "S",
      labelTh: "S",
      minWeightGrams: 0,
    };
    await env.db.insert(sizeTier).values(tier);
    expect(await mapped(env.db.insert(sizeTier).values({ ...tier, minWeightGrams: 3000 }))).toBe("CODE_TAKEN");
    await asReplica(async () => {
      const unit = { organizationId: env.base.orgId, branchId: env.base.branchId, roomTypeId: randomUUID(), code: "A1" };
      await env.db.insert(roomUnit).values(unit);
      expect(await mapped(env.db.insert(roomUnit).values(unit))).toBe("CODE_TAKEN");
    });
  });

  it("other unique indexes → INTERNAL", async () => {
    const s = {
      tokenHash: "h",
      subjectType: "staff" as const,
      subjectId: env.base.staff.owner,
      expiresAt: new Date("2026-11-01T00:00:00Z"),
    };
    await env.db.insert(session).values(s);
    expect(await mapped(env.db.insert(session).values(s))).toBe("INTERNAL");
  });
});

describe("mapPgError — foreign keys (23503)", () => {
  it("deleting a referenced row → IN_USE", async () => {
    expect(await mapped(env.db.delete(organization).where(eq(organization.id, env.base.orgId)))).toBe("IN_USE");
  });

  it("inserting a dangling reference → INTERNAL (bug, not user error)", async () => {
    expect(await mapped(env.db.insert(branch).values({ organizationId: randomUUID(), name: "x", bookingSlug: "dangling" }))).toBe(
      "INTERNAL",
    );
  });
});

describe("mapPgError — other inputs", () => {
  it("postgres-js shape (constraint_name) is understood", () => {
    expect(mapPgError({ code: "23P01", message: "", constraint_name: "stay_room_no_overlap" }).code).toBe("ROOM_TAKEN");
    expect(mapPgError({ code: "23505", message: "", constraint_name: "staff_user_email_uq" }).code).toBe("EMAIL_TAKEN");
    expect(
      mapPgError(new Error("wrap", { cause: { code: "23505", message: "", constraint_name: "room_unit_branch_id_code_uq" } })).code,
    ).toBe("CODE_TAKEN");
  });

  it("unknown 23P01 constraint, non-pg errors → INTERNAL; AppError passes through", () => {
    expect(mapPgError({ code: "23P01", message: "", constraint: "something_else" }).code).toBe("INTERNAL");
    expect(mapPgError(new Error("boom")).code).toBe("INTERNAL");
    expect(mapPgError("nope").code).toBe("INTERNAL");
    const e = new AppError("NOT_FOUND");
    expect(mapPgError(e)).toBe(e);
  });

  it("AppError carries the catalog HTTP status + Thai message", () => {
    const e = new AppError("SLOT_TAKEN", { slot: 1 });
    expect([e.http, e.message, e.details]).toEqual([ERROR_HTTP.SLOT_TAKEN, ERROR_MESSAGE_TH.SLOT_TAKEN, { slot: 1 }]);
    expect(mapPgError(new Error("x")).http).toBe(500);
  });
});
