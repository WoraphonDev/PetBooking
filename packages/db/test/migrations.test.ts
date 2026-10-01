// Proves the committed migrations (incl. 0001_constraints.sql) really enforce what 02 §13 promises.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../src/test-db";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => t.close());

const q = (sql: string, params: unknown[] = []) => t.pg.query(sql, params);
const code = async (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: { code?: string; message?: string }) => e.code ?? e.message ?? "error",
  );

// fixture rows without FK chains: replica role disables FK/user triggers; CHECK + EXCLUDE stay enforced
async function asReplica<T>(fn: () => Promise<T>): Promise<T> {
  await t.pg.exec("set session_replication_role = replica");
  try {
    return await fn();
  } finally {
    await t.pg.exec("set session_replication_role = origin");
  }
}
const org = randomUUID();
const appt = (o: Record<string, unknown>) =>
  q(
    `insert into groom_appointment (organization_id, branch_id, booking_id, pet_id, groomer_id, station_id, starts_at, ends_at, blocked_until, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      org,
      randomUUID(),
      randomUUID(),
      randomUUID(),
      o.groomer,
      o.station ?? randomUUID(),
      o.starts,
      o.ends,
      o.blocked,
      o.status ?? "scheduled",
    ],
  );

describe("migrations", () => {
  it("creates every table and the 4 exclusion constraints", async () => {
    const tables = await q(
      `select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    expect((tables.rows[0] as { n: number }).n).toBeGreaterThanOrEqual(72);
    const ex = await q(`select conname from pg_constraint where contype = 'x' order by 1`);
    expect(ex.rows.map((r) => (r as { conname: string }).conname)).toEqual([
      "groom_appt_groomer_no_overlap",
      "groom_appt_station_no_overlap",
      "stay_pet_no_overlap",
      "stay_room_no_overlap",
    ]);
  });

  it("groomer cannot be double-booked inside blocked_until (buffer); cancelled rows don't block", async () => {
    const g = randomUUID();
    await asReplica(async () => {
      expect(
        await code(appt({ groomer: g, starts: "2026-10-05T03:00:00Z", ends: "2026-10-05T04:00:00Z", blocked: "2026-10-05T04:15:00Z" })),
      ).toBe("ok");
      expect(
        await code(appt({ groomer: g, starts: "2026-10-05T04:10:00Z", ends: "2026-10-05T05:00:00Z", blocked: "2026-10-05T05:00:00Z" })),
      ).toBe("23P01");
      expect(
        await code(appt({ groomer: g, starts: "2026-10-05T04:15:00Z", ends: "2026-10-05T05:00:00Z", blocked: "2026-10-05T05:00:00Z" })),
      ).toBe("ok");
      expect(
        await code(
          appt({
            groomer: g,
            starts: "2026-10-05T03:30:00Z",
            ends: "2026-10-05T04:00:00Z",
            blocked: "2026-10-05T04:00:00Z",
            status: "cancelled",
          }),
        ),
      ).toBe("ok");
    });
  });

  it("same station cannot be used twice at the same time (different groomers)", async () => {
    const st = randomUUID();
    await asReplica(async () => {
      expect(
        await code(
          appt({
            groomer: randomUUID(),
            station: st,
            starts: "2026-10-06T03:00:00Z",
            ends: "2026-10-06T04:00:00Z",
            blocked: "2026-10-06T04:00:00Z",
          }),
        ),
      ).toBe("ok");
      expect(
        await code(
          appt({
            groomer: randomUUID(),
            station: st,
            starts: "2026-10-06T03:30:00Z",
            ends: "2026-10-06T04:30:00Z",
            blocked: "2026-10-06T04:30:00Z",
          }),
        ),
      ).toBe("23P01");
    });
  });

  it("append-only tables reject UPDATE and DELETE", async () => {
    const id = await asReplica(async () => {
      const r = await q(
        `insert into audit_log (organization_id, actor_type, action, entity_type) values ($1, 'system', 'policy.update', 'branch_policy') returning id`,
        [org],
      );
      return (r.rows[0] as { id: string }).id;
    });
    expect(await code(q(`update audit_log set action = action where id = $1`, [id]))).toBe("P0001");
    expect(await code(q(`delete from audit_log where id = $1`, [id]))).toBe("P0001");
  });

  it("createTestDb() returns isolated databases", async () => {
    const other = await createTestDb();
    const n = await other.pg.query(`select count(*)::int as n from groom_appointment`);
    expect((n.rows[0] as { n: number }).n).toBe(0);
    await other.close();
  });
});
