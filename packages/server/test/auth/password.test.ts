import { staffUser } from "@app/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashNewPassword, hashPassword, verifyPassword, verifyStaffLogin, verifyUnknownUserPassword } from "../../src/auth/password.ts";
import { setupTestDb, TEST_NOW, type TestEnv } from "../helpers/setup.ts";

let env: TestEnv;
let pwHash: string;
beforeAll(async () => {
  env = await setupTestDb();
  pwHash = await hashPassword("groom2026!");
});
afterAll(async () => env.close());

const MIN = 60 * 1000;
const at = (ms: number) => new Date(TEST_NOW.getTime() + ms);
const loadStaff = async (id: string) => {
  const [row] = await env.db.select().from(staffUser).where(eq(staffUser.id, id));
  if (!row) throw new Error("staff not found");
  return row;
};

describe("argon2id", () => {
  it("uses argon2id with m=19456, t=2, p=1", () => {
    expect(pwHash.startsWith("$argon2id$v=19$m=19456,t=2,p=1$")).toBe(true);
  });

  it("verifies the right password only; garbage hash → false", async () => {
    expect(await verifyPassword(pwHash, "groom2026!")).toBe(true);
    expect(await verifyPassword(pwHash, "groom2026?")).toBe(false);
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });

  it("hashNewPassword enforces R-24 policy → PASSWORD_POLICY with details.reason", async () => {
    await expect(hashNewPassword("12345678")).rejects.toMatchObject({
      code: "PASSWORD_POLICY",
      details: { reason: "PASSWORD_ALL_DIGITS" },
    });
    await expect(hashNewPassword("somchai.pet", "Somchai.Pet@example.com")).rejects.toMatchObject({
      details: { reason: "PASSWORD_SAME_AS_EMAIL" },
    });
    expect(await verifyPassword(await hashNewPassword("groom2026!"), "groom2026!")).toBe(true);
  });

  it("unknown user always fails", async () => {
    expect(await verifyUnknownUserPassword("groom2026!")).toBe(false);
  });
});

describe("verifyStaffLogin (R-24 persisted)", () => {
  it("locks after 5 consecutive failures, rejects the right password while locked, then succeeds after 15 min", async () => {
    const id = env.base.staff.front_desk;
    await env.db.update(staffUser).set({ passwordHash: pwHash }).where(eq(staffUser.id, id));
    for (let i = 1; i <= 4; i++) {
      expect(await verifyStaffLogin(env.db, await loadStaff(id), "wrong", TEST_NOW)).toEqual({ ok: false, error: "INVALID_CREDENTIALS" });
      expect((await loadStaff(id)).failedLoginCount).toBe(i);
    }
    expect(await verifyStaffLogin(env.db, await loadStaff(id), "wrong", TEST_NOW)).toEqual({ ok: false, error: "ACCOUNT_LOCKED" });
    expect(await loadStaff(id)).toMatchObject({ failedLoginCount: 0, lockedUntil: at(15 * MIN) });

    expect(await verifyStaffLogin(env.db, await loadStaff(id), "groom2026!", at(14 * MIN))).toEqual({ ok: false, error: "ACCOUNT_LOCKED" });
    expect(await verifyStaffLogin(env.db, await loadStaff(id), "groom2026!", at(15 * MIN))).toEqual({ ok: true, error: null });
    expect(await loadStaff(id)).toMatchObject({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: at(15 * MIN) });
  });

  it("success resets the counter; no password set → INVALID_CREDENTIALS", async () => {
    const id = env.base.staff.owner;
    await env.db.update(staffUser).set({ passwordHash: pwHash, failedLoginCount: 3 }).where(eq(staffUser.id, id));
    expect(await verifyStaffLogin(env.db, await loadStaff(id), "groom2026!", TEST_NOW)).toEqual({ ok: true, error: null });
    expect((await loadStaff(id)).failedLoginCount).toBe(0);

    const noPw = env.base.staff.staff;
    expect(await verifyStaffLogin(env.db, await loadStaff(noPw), "anything", TEST_NOW)).toEqual({
      ok: false,
      error: "INVALID_CREDENTIALS",
    });
    expect((await loadStaff(noPw)).failedLoginCount).toBe(1);
  });
});
