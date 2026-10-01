import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ApiError } from "../src/common.ts";
import { ERROR_HTTP, ERROR_MESSAGE_TH, errorCode, errorCodeValues } from "../src/errors.ts";

type Entry = { code: string; http: number; messageTh: string };
const vectors: Entry[] = JSON.parse(readFileSync(new URL("../../../docs/spec/vectors/errors.json", import.meta.url), "utf8")).errors;

describe("errors ⇄ docs/spec/vectors/errors.json", () => {
  it("has exactly the same codes in the same order", () => {
    expect(errorCodeValues).toEqual(vectors.map((v) => v.code));
    expect(Object.keys(ERROR_HTTP)).toEqual(vectors.map((v) => v.code));
    expect(Object.keys(ERROR_MESSAGE_TH)).toEqual(vectors.map((v) => v.code));
  });

  for (const v of vectors) {
    it(v.code, () => {
      expect(ERROR_HTTP[v.code as keyof typeof ERROR_HTTP]).toBe(v.http);
      expect(ERROR_MESSAGE_TH[v.code as keyof typeof ERROR_MESSAGE_TH]).toBe(v.messageTh);
    });
  }

  it("ApiError accepts catalog codes only", () => {
    expect(errorCode.safeParse("SLOT_TAKEN").success).toBe(true);
    expect(ApiError.safeParse({ error: { code: "SLOT_TAKEN", message: "x", details: {} } }).success).toBe(true);
    expect(ApiError.safeParse({ error: { code: "NOPE", message: "x" } }).success).toBe(false);
  });
});
