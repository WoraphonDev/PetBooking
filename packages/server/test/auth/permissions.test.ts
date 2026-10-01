import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PERMISSIONS, requireRole } from "../../src/auth/permissions.ts";
import { makeSystemCtx } from "../../src/context.ts";
import { customerCtx, staffCtx } from "../helpers/setup.ts";

const json: Record<string, string[]> = JSON.parse(
  readFileSync(new URL("../../../../docs/spec/vectors/permissions.json", import.meta.url), "utf8"),
).staff;
const base = { orgId: "o", branchId: "b", staff: { owner: "s1", front_desk: "s2", staff: "s3" }, ownerProfileId: "p", customerId: "c" };

describe("PERMISSIONS ⇄ docs/spec/vectors/permissions.json", () => {
  it("has exactly the same keys and roles", () => {
    expect(PERMISSIONS).toEqual(json);
    expect(Object.keys(PERMISSIONS)).toEqual(Object.keys(json));
  });
});

describe("requireRole", () => {
  it("allows listed roles and rejects others with FORBIDDEN", () => {
    expect(() => requireRole(staffCtx(base, "owner"), "branch.update")).not.toThrow();
    expect(() => requireRole(staffCtx(base, "front_desk"), "branch.update")).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(() => requireRole(staffCtx(base, "front_desk"), "closures.create")).not.toThrow();
    expect(() => requireRole(staffCtx(base, "staff"), "closures.create")).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(() => requireRole(staffCtx(base, "staff"), "auth.me")).not.toThrow();
  });

  it("non-staff actors are FORBIDDEN on staff endpoints", () => {
    expect(() => requireRole(customerCtx(base), "auth.me")).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(() => requireRole(makeSystemCtx("o", new Date(0)), "auth.me")).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("unknown key is a bug, not FORBIDDEN", () => {
    expect(() => requireRole(staffCtx(base, "owner"), "nope.nope" as never)).toThrow(/unknown endpoint key/);
  });
});
