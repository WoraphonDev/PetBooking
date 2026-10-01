// vaccine_type seed migration ⇄ docs/spec/vectors/reference-data.json (10 §1).
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../src/test-db";

type VaccineType = { code: string; species: string; nameTh: string; nameEn: string; defaultValidityMonths: number; sortOrder: number };
const { vaccineTypes } = JSON.parse(readFileSync(new URL("../../../docs/spec/vectors/reference-data.json", import.meta.url), "utf8")) as {
  vaccineTypes: VaccineType[];
};

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => t.close());

describe("seed vaccine_type", () => {
  it("has exactly the reference rows", async () => {
    const rows = await t.db.query.vaccineType.findMany();
    expect(rows).toHaveLength(6);
    const byCode = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code);
    expect(
      rows
        .map((r) => ({
          code: r.code,
          species: r.species,
          nameTh: r.nameTh,
          nameEn: r.nameEn,
          defaultValidityMonths: r.defaultValidityMonths,
          sortOrder: r.sortOrder,
        }))
        .sort(byCode),
    ).toEqual([...vaccineTypes].sort(byCode));
  });

  it("is idempotent (ON CONFLICT DO NOTHING)", async () => {
    const sqlText = readFileSync(new URL("../migrations/0002_seed_vaccine_types.sql", import.meta.url), "utf8");
    await t.pg.exec(sqlText);
    const n = await t.pg.query(`select count(*)::int as n from vaccine_type`);
    expect((n.rows[0] as { n: number }).n).toBe(6);
  });
});
