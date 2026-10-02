import { readFileSync } from "node:fs";
import { AdminCreateOrgRequest, AdminCreateOrgResponse } from "@app/contracts/endpoints/admin.createOrg";
import {
  branch,
  branchHours,
  branchPolicy,
  consentRecord,
  groomStation,
  organization,
  platformAdmin,
  ratePlan,
  sizeTier,
  staffInvite,
  staffUser,
} from "@app/db/schema";
import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession, hashToken } from "../../../src/auth/session.ts";
import { withAdmin } from "../../../src/http/wrap.ts";
import { adminCreateOrg } from "../../../src/services/admin/createOrg.ts";
import { setupTestDb, TEST_NOW, type TestEnv } from "../../helpers/setup.ts";

const reference = JSON.parse(readFileSync(new URL("../../../../../docs/spec/vectors/reference-data.json", import.meta.url), "utf8"));
const POST = withAdmin("admin.createOrg", { body: AdminCreateOrgRequest }, adminCreateOrg);
const input = {
  name: "Happy Paws",
  slug: "happy-paws",
  branchName: "Happy Paws สาขาหลัก",
  bookingSlug: "happy-paws-main",
  ownerEmail: "Owner@HappyPaws.test",
  ownerName: "คุณเจ้าของ",
  modules: { grooming: false, hotel: true, daycare: true },
};

let env: TestEnv;
let adminToken: string;
const request = (body: unknown, cookie = adminToken) =>
  POST(
    new Request("https://petbooking.test/api/v1/admin/organizations", {
      method: "POST",
      headers: { origin: "https://petbooking.test", "content-type": "application/json", cookie: `aid=${cookie}` },
      body: JSON.stringify(body),
    }),
  );
const errorCode = async (response: Response) => ((await response.json()) as { error: { code: string } }).error.code;

beforeEach(async () => {
  vi.stubEnv("APP_BASE_URL", "https://petbooking.test");
  env = await setupTestDb();
  const [admin] = await env.db
    .insert(platformAdmin)
    .values({ email: "admin@example.test", displayName: "Admin", passwordHash: "unused" })
    .returning();
  if (!admin) throw new Error("Missing admin");
  adminToken = (await createSession(env.db, { subjectType: "platform_admin", subjectId: admin.id }, TEST_NOW)).token;
});
afterEach(async () => {
  await env.close();
  vi.unstubAllEnvs();
});

it("creates a pilot shop whose stored values match every mapped request field", async () => {
  const response = await request(input);
  expect(response.status).toBe(200);
  const body = AdminCreateOrgResponse.parse(await response.json());
  const [org] = await env.db.select().from(organization).where(eq(organization.slug, "happy-paws"));
  const [br] = await env.db
    .select()
    .from(branch)
    .where(eq(branch.organizationId, org?.id ?? ""));
  const [owner] = await env.db
    .select()
    .from(staffUser)
    .where(eq(staffUser.organizationId, org?.id ?? ""));
  expect(org).toMatchObject({ name: "Happy Paws", slug: "happy-paws", status: "pilot" });
  expect(br).toMatchObject({
    name: "Happy Paws สาขาหลัก",
    bookingSlug: "happy-paws-main",
    moduleGrooming: false,
    moduleHotel: true,
    moduleDaycare: true,
    receiptPrefix: "R",
  });
  expect(owner).toMatchObject({
    email: "owner@happypaws.test",
    displayName: "คุณเจ้าของ",
    role: "owner",
    status: "invited",
    passwordHash: null,
  });
  expect(body.organization).toEqual({
    id: org?.id,
    name: "Happy Paws",
    slug: "happy-paws",
    status: "pilot",
    branchName: "Happy Paws สาขาหลัก",
    bookingSlug: "happy-paws-main",
    ownerEmail: "owner@happypaws.test",
    lineStatus: null,
    createdAt: org?.createdAt.toISOString(),
    lastActivityAt: null,
  });

  const token = /^https:\/\/petbooking\.test\/invite\/([A-Za-z0-9_-]+)$/.exec(body.ownerInviteUrl)?.[1];
  expect(token).toBeDefined();
  const [invite] = await env.db
    .select()
    .from(staffInvite)
    .where(eq(staffInvite.organizationId, org?.id ?? ""));
  expect(invite).toMatchObject({
    staffUserId: owner?.id,
    createdBy: owner?.id,
    tokenHash: hashToken(token ?? ""),
    acceptedAt: null,
    expiresAt: new Date((org?.createdAt.getTime() ?? 0) + 7 * 24 * 60 * 60_000),
  });
  expect(invite?.createdAt).toEqual(org?.createdAt);
});

it("seeds branch defaults in the same transaction and leaves shop consent for invite acceptance", async () => {
  const { organization: created } = AdminCreateOrgResponse.parse(await request(input).then((r) => r.json()));
  const [br] = await env.db.select().from(branch).where(eq(branch.organizationId, created.id));
  if (!br) throw new Error("Missing branch");
  const [policy] = await env.db.select().from(branchPolicy).where(eq(branchPolicy.branchId, br.id));
  expect(policy).toMatchObject({
    defaultDepositType: "none",
    groomingFreeCancelHours: 24,
    hotelFreeCancelHours: 72,
    cancelRefundMode: "credit",
    slotStepMinutes: 15,
    groomingConsentText: reference.templates.grooming_consent_text,
    boardingAgreementText: reference.templates.boarding_agreement_text,
    policyText:
      "มัดจำ ไม่เก็บ · ยกเลิกฟรีก่อนเวลานัด กรูม 24 ชม. / โรงแรม 72 ชม. / Daycare 24 ชม. · ยกเลิกหลังจากนั้นหรือไม่มาตามนัด ร้านขอสงวนสิทธิ์ริบมัดจำ 100% (ไม่มาตามนัดริบทั้งหมด) · ส่วนที่ไม่ริบคืนเป็นเครดิตใช้ครั้งถัดไป · เลื่อนนัดเองได้ถึง 24 ชม. ก่อนนัด ไม่เกิน 2 ครั้ง",
  });
  const hours = await env.db.select().from(branchHours).where(eq(branchHours.branchId, br.id)).orderBy(asc(branchHours.weekday));
  expect(hours.map((h) => [h.weekday, h.isClosed, h.opensAt, h.closesAt])).toEqual(
    [0, 1, 2, 3, 4, 5, 6].map((weekday) => [weekday, false, "09:00:00", "18:00:00"]),
  );
  const plans = await env.db.select().from(ratePlan).where(eq(ratePlan.branchId, br.id));
  expect(plans).toEqual([
    expect.objectContaining({ organizationId: created.id, code: "standard", name: "ราคาปกติ", channel: "all", isDefault: true }),
  ]);
  const tiers = await env.db.select().from(sizeTier).where(eq(sizeTier.branchId, br.id));
  expect(
    tiers.map((t) => ({
      species: t.species,
      code: t.code,
      labelTh: t.labelTh,
      minGrams: t.minWeightGrams,
      maxGrams: t.maxWeightGrams,
      sortOrder: t.sortOrder,
    })),
  ).toEqual(expect.arrayContaining(reference.defaultSizeTiers));
  expect(tiers).toHaveLength(7);
  expect(tiers.every((t) => t.organizationId === created.id)).toBe(true);
  const stations = await env.db.select().from(groomStation).where(eq(groomStation.branchId, br.id));
  expect(stations).toEqual([expect.objectContaining({ organizationId: created.id, name: "โต๊ะ 1", sortOrder: 1, status: "active" })]);
  expect(await env.db.select().from(consentRecord)).toEqual([]);
});

it("rejects a taken organization slug or booking slug with SLUG_TAKEN and writes nothing", async () => {
  const orgsBefore = await env.db.select().from(organization);
  const orgSlug = await request({ ...input, slug: "shop-a" });
  expect(orgSlug.status).toBe(409);
  expect(await errorCode(orgSlug)).toBe("SLUG_TAKEN");
  const bookingSlug = await request({ ...input, bookingSlug: "shop-a" });
  expect(bookingSlug.status).toBe(409);
  expect(await errorCode(bookingSlug)).toBe("SLUG_TAKEN");
  expect(await env.db.select().from(organization)).toHaveLength(orgsBefore.length);
});

it("rejects an owner email used by any staff (case-insensitive) with EMAIL_TAKEN and writes nothing", async () => {
  const response = await request({ ...input, ownerEmail: "OWNER@a.test" });
  expect(response.status).toBe(409);
  expect(await errorCode(response)).toBe("EMAIL_TAKEN");
  expect(await env.db.select().from(organization).where(eq(organization.slug, "happy-paws"))).toEqual([]);
});

it("rejects missing or malformed fields with VALIDATION_FAILED", async () => {
  const { ownerName: _ownerName, ...missing } = input;
  for (const body of [
    missing,
    { ...input, slug: "Happy_Paws" },
    { ...input, slug: "ab" },
    { ...input, bookingSlug: "x".repeat(41) },
    { ...input, ownerEmail: "not-an-email" },
    { ...input, name: "" },
    { ...input, modules: { grooming: true, hotel: false } },
  ]) {
    const response = await request(body);
    expect(response.status).toBe(422);
    expect(await errorCode(response)).toBe("VALIDATION_FAILED");
  }
  expect(await env.db.select().from(organization).where(eq(organization.slug, "happy-paws"))).toEqual([]);
});

it("requires a platform admin session", async () => {
  for (const [subjectType, subjectId] of [
    ["staff", env.base.staff.owner],
    ["customer", env.base.ownerProfileId],
  ] as const) {
    const { token } = await createSession(env.db, { subjectType, subjectId }, TEST_NOW);
    expect((await request(input, token)).status).toBe(401);
  }
  expect((await request(input, "missing")).status).toBe(401);
  expect(await env.db.select().from(organization).where(eq(organization.slug, "happy-paws"))).toEqual([]);
});
