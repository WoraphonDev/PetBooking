import * as schema from "@app/db/schema";
import { describe, expect, it } from "vitest";
import * as enums from "../src/enums.ts";

type PgEnumLike = { enumName: string; enumValues: readonly string[] };
const isPgEnum = (v: unknown): v is PgEnumLike =>
  typeof v === "function" &&
  typeof (v as Partial<PgEnumLike>).enumName === "string" &&
  Array.isArray((v as Partial<PgEnumLike>).enumValues);

const pgEnums = Object.values(schema as Record<string, unknown>).filter(isPgEnum);
const camel = (s: string) => s.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
const contracts = enums as unknown as Record<string, { options?: readonly string[] } | readonly string[]>;
const zodEnumNames = Object.keys(enums).filter((k) => !k.endsWith("Values"));

describe("enums ⇄ @app/db pgEnum", () => {
  it("covers all 72 enums, no extras", () => {
    expect(pgEnums).toHaveLength(72);
    expect(zodEnumNames.sort()).toEqual(pgEnums.map((e) => camel(e.enumName)).sort());
  });

  for (const e of pgEnums) {
    const name = camel(e.enumName);
    it(`${e.enumName} → ${name}`, () => {
      expect(contracts[`${name}Values`]).toEqual(e.enumValues);
      expect((contracts[name] as { options: readonly string[] }).options).toEqual(e.enumValues);
    });
  }
});
