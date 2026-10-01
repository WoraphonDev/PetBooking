import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

const db = new PGlite({ extensions: { btree_gist } });
const run = async (file: string) => {
  const parts = readFileSync(file, "utf8").split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean);
  for (const p of parts) await db.exec(p);
  return parts.length;
};
const MIG = process.argv[2] ?? "migrations"; // folder produced by drizzle-kit generate
const n1 = await run(MIG + "/" + readdirSync(MIG).find(f => f.endsWith(".sql"))!);
const n2 = await run(new URL("../../_custom_constraints.sql", import.meta.url).pathname);
console.log(`migrated: ${n1} drizzle statements + ${n2} custom statements`);
const tables = (await db.query<{ t: string }>(`select table_name t from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`)).rows.length;
const checks = (await db.query<{ n: number }>(`select count(*)::int n from pg_constraint where contype='c'`)).rows[0]!.n;
const excl = (await db.query<{ conname: string }>(`select conname from pg_constraint where contype='x' order by 1`)).rows.map(r => r.conname);
console.log({ tables, checks, exclusion: excl });

// generic row builder: fills NOT NULL columns w/o default
const cols = async (t: string) => (await db.query<any>(
  `select column_name, data_type, udt_name, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`, [t])).rows;
const enumFirst = async (udt: string) => (await db.query<any>(`select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname=$1 order by e.enumsortorder limit 1`, [udt])).rows[0]?.enumlabel;
async function ins(t: string, o: Record<string, any> = {}) {
  const row: Record<string, any> = { ...o };
  for (const c of await cols(t)) {
    if (c.column_name in row || c.is_nullable === "YES" || c.column_default !== null) continue;
    const dt = c.data_type, u = c.udt_name;
    row[c.column_name] = dt === "uuid" ? randomUUID() : dt === "text" || dt.startsWith("character") ? "x"
      : ["integer", "bigint", "smallint", "numeric"].includes(dt) ? 0 : dt === "boolean" ? false
      : dt.startsWith("timestamp") ? "2026-10-01T03:00:00Z" : dt === "date" ? "2026-10-01" : dt.startsWith("time") ? "09:00"
      : dt === "jsonb" || dt === "json" ? "{}" : dt === "ARRAY" ? "{}" : dt === "USER-DEFINED" ? await enumFirst(u) : null;
  }
  const keys = Object.keys(row);
  const sql = `insert into ${t} (${keys.map(k => `"${k}"`).join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning id`;
  return (await db.query<{ id: string }>(sql, keys.map(k => row[k]))).rows[0]!.id;
}
const expectErr = async (label: string, code: string, f: () => Promise<unknown>) => {
  try { await f(); console.log(`FAIL ${label}: no error`); process.exitCode = 1; }
  catch (e: any) { const ok = e.code === code || (code === "P0001" && /append-only/.test(e.message));
    console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${e.code} ${String(e.message).slice(0, 90)}`); if (!ok) process.exitCode = 1; }
};
const expectOk = async (label: string, f: () => Promise<unknown>) => {
  try { await f(); console.log(`ok   ${label}`); } catch (e: any) { console.log(`FAIL ${label}: ${e.code} ${e.message}`); process.exitCode = 1; }
};

await db.exec("set session_replication_role = replica"); // skip FK triggers for fixture rows (exclusion/check still enforced)
const org = randomUUID(), groomer = randomUUID(), groomer2 = randomUUID(), station = randomUUID(), room = randomUUID(), pet = randomUUID(), pet2 = randomUUID();
const appt = (o: any) => ins("groom_appointment", { organization_id: org, groomer_id: groomer, ...o });
await expectOk("appt A 10:00–11:00(+15 buffer)", () => appt({ starts_at: "2026-10-01T03:00:00Z", ends_at: "2026-10-01T04:00:00Z", blocked_until: "2026-10-01T04:15:00Z", status: "scheduled" }));
await expectErr("same groomer overlaps buffer → 23P01", "23P01", () => appt({ starts_at: "2026-10-01T04:10:00Z", ends_at: "2026-10-01T05:00:00Z", blocked_until: "2026-10-01T05:15:00Z", status: "scheduled" }));
await expectOk("same groomer right after buffer", () => appt({ starts_at: "2026-10-01T04:15:00Z", ends_at: "2026-10-01T05:00:00Z", blocked_until: "2026-10-01T05:15:00Z", status: "scheduled" }));
await expectOk("cancelled appt may overlap", () => appt({ starts_at: "2026-10-01T03:30:00Z", ends_at: "2026-10-01T04:00:00Z", blocked_until: "2026-10-01T04:00:00Z", status: "cancelled" }));
await expectOk("other groomer same time", () => appt({ groomer_id: groomer2, starts_at: "2026-10-01T03:00:00Z", ends_at: "2026-10-01T04:00:00Z", blocked_until: "2026-10-01T04:00:00Z", status: "scheduled", station_id: station }));
await expectErr("same station overlaps → 23P01", "23P01", () => appt({ groomer_id: randomUUID(), station_id: station, starts_at: "2026-10-01T03:30:00Z", ends_at: "2026-10-01T04:30:00Z", blocked_until: "2026-10-01T04:30:00Z", status: "scheduled" }));
const nights = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const stay = (o: any) => ins("stay", { organization_id: org, nights: nights(o.check_in_date, o.check_out_date), ...o });
await expectOk("stay room 1–3 Oct", () => stay({ room_unit_id: room, pet_id: pet, check_in_date: "2026-10-01", check_out_date: "2026-10-03", status: "reserved" }));
await expectOk("same room checkout-day checkin (3–5 Oct)", () => stay({ room_unit_id: room, pet_id: pet2, check_in_date: "2026-10-03", check_out_date: "2026-10-05", status: "reserved" }));
await expectErr("same room overlapping nights → 23P01", "23P01", () => stay({ room_unit_id: room, pet_id: randomUUID(), check_in_date: "2026-10-02", check_out_date: "2026-10-04", status: "reserved" }));
await expectErr("same pet double stay → 23P01", "23P01", () => stay({ room_unit_id: randomUUID(), pet_id: pet, check_in_date: "2026-10-02", check_out_date: "2026-10-04", status: "reserved" }));
await expectOk("cancelled stay frees the room", async () => { await stay({ room_unit_id: room, pet_id: randomUUID(), check_in_date: "2026-10-01", check_out_date: "2026-10-02", status: "cancelled" }); });
await expectErr("check_out ≤ check_in rejected", "23514", () => ins("stay", { organization_id: org, room_unit_id: randomUUID(), pet_id: randomUUID(), check_in_date: "2026-10-05", check_out_date: "2026-10-05", nights: 0, status: "reserved" }));

await db.exec("set session_replication_role = origin");
await db.exec("set session_replication_role = replica");
const a = await ins("audit_log", { organization_id: org });
const ev = await ins("booking_event", { organization_id: org });
const cl = await ins("credit_ledger", { organization_id: org, delta_satang: 10000 });
const cr = await ins("consent_record", {});
await db.exec("set session_replication_role = origin");
for (const [t, id] of [["audit_log", a], ["booking_event", ev], ["credit_ledger", cl], ["consent_record", cr]] as const) {
  await expectErr(`${t} UPDATE blocked`, "P0001", () => db.query(`update ${t} set id = id where id = $1`, [id]));
  await expectErr(`${t} DELETE blocked`, "P0001", () => db.query(`delete from ${t} where id = $1`, [id]));
}
// FK enforcement back on: booking.bill_id → bill
await db.exec("set session_replication_role = replica");
const bk = await ins("booking", { organization_id: org });
await db.exec("set session_replication_role = origin");
await expectErr("booking.bill_id → bill FK enforced", "23503", () => db.query(`update booking set bill_id=$1 where id=$2`, [randomUUID(), bk]));
console.log(process.exitCode ? "PROOF FAILED" : "PROOF OK");
