// Dev/E2E seed (T-0039): one complete sample shop. `DATABASE_URL=… pnpm --filter @app/server db:seed` after db:migrate.
// Runs through the real services where one exists so the rows match what the app itself writes.
// Room types have no merged service yet (T-0265), so those rows and their rates are inserted directly.
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { StaffRole } from "@app/contracts/enums";
import { branch, organization, ratePlan, roomRate, roomType, sizeTier, staffInvite, staffUser, staffWorkingHours } from "@app/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import referenceData from "../../../../docs/spec/vectors/reference-data.json";
import { hashPassword } from "../auth/password.ts";
import type { RequestContext } from "../context.ts";
import { type AppDb, getDb, setDb } from "../db.ts";
import { tenantDb } from "../repo/tenant.ts";
import { adminCreateOrg } from "../services/admin/createOrg.ts";
import { customersCreate } from "../services/customers/create.ts";
import { daycareTypesUpsert } from "../services/daycareTypes/upsert.ts";
import { petsCreate } from "../services/pets/create.ts";
import { roomUnitsUpsert } from "../services/roomUnits/upsert.ts";
import { servicesCreate } from "../services/services/create.ts";
import { servicesSetPrices } from "../services/services/setPrices.ts";

/** Dev-only sign-in for every seeded staff account (local/E2E databases only). */
export const DEV_PASSWORD = "PetShop-dev-2026";
export const DEV_SHOP_SLUG = "demo-shop";
export const DEV_STAFF: { key: string; email: string; displayName: string; role: StaffRole; isGroomer: boolean }[] = [
  { key: "owner", email: "owner@demo-shop.test", displayName: "พี่เจ้าของ", role: "owner", isGroomer: false },
  { key: "frontDesk", email: "frontdesk@demo-shop.test", displayName: "น้องหน้าร้าน", role: "front_desk", isGroomer: false },
  { key: "groomer1", email: "groomer1@demo-shop.test", displayName: "ช่างแนน", role: "staff", isGroomer: true },
  { key: "groomer2", email: "groomer2@demo-shop.test", displayName: "ช่างบอย", role: "staff", isGroomer: true },
];

export type DevShop = {
  orgId: string;
  branchId: string;
  staff: Record<string, string>;
  serviceIds: string[];
  roomTypeIds: string[];
  roomUnitIds: string[];
  daycareSessionTypeIds: string[];
  customerIds: string[];
  petIds: string[];
};

type Species = "dog" | "cat";
/** prices in satang per size tier code; minutes per size tier code */
type ServiceSeed = {
  category: "bath" | "haircut" | "spa" | "nail" | "ear";
  nameTh: string;
  isAddon: boolean;
  prices: Record<Species, Record<string, [priceSatang: number, durationMinutes: number]>>;
};

const SERVICES: ServiceSeed[] = [
  {
    category: "bath",
    nameTh: "อาบน้ำ-เป่าแห้ง",
    isAddon: false,
    prices: {
      dog: { XS: [25_000, 45], S: [30_000, 60], M: [40_000, 75], L: [55_000, 90], XL: [70_000, 120] },
      cat: { S: [40_000, 60], L: [50_000, 75] },
    },
  },
  {
    category: "haircut",
    nameTh: "ตัดขนทั้งตัว",
    isAddon: false,
    prices: {
      dog: { XS: [45_000, 90], S: [55_000, 105], M: [70_000, 120], L: [90_000, 150], XL: [120_000, 180] },
      cat: { S: [70_000, 90], L: [85_000, 120] },
    },
  },
  {
    category: "spa",
    nameTh: "สปาขนนุ่ม",
    isAddon: false,
    prices: {
      dog: { XS: [35_000, 60], S: [40_000, 75], M: [50_000, 90], L: [65_000, 105], XL: [80_000, 120] },
      cat: { S: [55_000, 75], L: [65_000, 90] },
    },
  },
  {
    category: "nail",
    nameTh: "ตัดเล็บ",
    isAddon: true,
    prices: {
      dog: { XS: [8_000, 10], S: [8_000, 10], M: [10_000, 15], L: [12_000, 15], XL: [15_000, 20] },
      cat: { S: [10_000, 15], L: [12_000, 15] },
    },
  },
  {
    category: "ear",
    nameTh: "ทำความสะอาดหู",
    isAddon: true,
    prices: {
      dog: { XS: [6_000, 10], S: [6_000, 10], M: [8_000, 10], L: [10_000, 15], XL: [12_000, 15] },
      cat: { S: [8_000, 10], L: [8_000, 10] },
    },
  },
];

const ROOM_TYPES = [
  {
    nameTh: "ห้องมาตรฐาน",
    amenities: ["aircon", "bed"],
    nightlyPriceSatang: 45_000,
    units: ["S1", "S2", "S3", "S4"],
  },
  {
    nameTh: "ห้องสวีท",
    amenities: ["aircon", "camera", "private", "bed", "toys"],
    nightlyPriceSatang: 80_000,
    units: ["V1", "V2"],
  },
];

const DAYCARE_SESSIONS = [
  { session: "full_day", nameTh: "เต็มวัน", startsAt: "09:00", endsAt: "18:00", capacity: 10, priceSatang: 35_000 },
  { session: "morning", nameTh: "รอบเช้า", startsAt: "09:00", endsAt: "13:00", capacity: 8, priceSatang: 20_000 },
  { session: "afternoon", nameTh: "รอบบ่าย", startsAt: "13:00", endsAt: "18:00", capacity: 8, priceSatang: 20_000 },
] as const;

type PetSeed = {
  name: string;
  species: Species;
  breed: string;
  sex: "male" | "female";
  coatType: "short" | "long" | "double" | "curly";
  weightGrams: number;
};
/** 10 customers, 14 pets (four households have two) */
const CUSTOMERS: { firstName: string; lastName: string; phone: string; pets: PetSeed[] }[] = [
  {
    firstName: "สมชาย",
    lastName: "ใจดี",
    phone: "0810000001",
    pets: [{ name: "โมจิ", species: "dog", breed: "ปอมเมอเรเนียน", sex: "male", coatType: "double", weightGrams: 2_800 }],
  },
  {
    firstName: "สุดา",
    lastName: "รักสัตว์",
    phone: "0810000002",
    pets: [
      { name: "ถุงทอง", species: "dog", breed: "ชิสุ", sex: "female", coatType: "long", weightGrams: 5_200 },
      { name: "ส้มโอ", species: "cat", breed: "เปอร์เซีย", sex: "female", coatType: "long", weightGrams: 4_100 },
    ],
  },
  {
    firstName: "อนันต์",
    lastName: "มั่นคง",
    phone: "0810000003",
    pets: [{ name: "บราวนี่", species: "dog", breed: "พุดเดิ้ล", sex: "male", coatType: "curly", weightGrams: 7_500 }],
  },
  {
    firstName: "วิภา",
    lastName: "สุขใจ",
    phone: "0810000004",
    pets: [
      { name: "ข้าวปั้น", species: "dog", breed: "เวลช์ คอร์กี้", sex: "male", coatType: "double", weightGrams: 12_400 },
      { name: "ขนมปัง", species: "dog", breed: "เวลช์ คอร์กี้", sex: "female", coatType: "double", weightGrams: 11_000 },
    ],
  },
  {
    firstName: "ปรีชา",
    lastName: "ทองดี",
    phone: "0810000005",
    pets: [{ name: "ลัคกี้", species: "dog", breed: "โกลเด้น รีทรีฟเวอร์", sex: "male", coatType: "double", weightGrams: 30_500 }],
  },
  {
    firstName: "นภา",
    lastName: "แสงทอง",
    phone: "0810000006",
    pets: [{ name: "มะลิ", species: "cat", breed: "สก็อตติช โฟลด์", sex: "female", coatType: "short", weightGrams: 3_600 }],
  },
  {
    firstName: "กิตติ",
    lastName: "ศรีสุข",
    phone: "0810000007",
    pets: [
      { name: "ชาไทย", species: "dog", breed: "ชิบะ อินุ", sex: "male", coatType: "double", weightGrams: 9_800 },
      { name: "ไข่ตุ๋น", species: "cat", breed: "บริติช ชอร์ตแฮร์", sex: "male", coatType: "short", weightGrams: 6_200 },
    ],
  },
  {
    firstName: "มาลี",
    lastName: "บุญมา",
    phone: "0810000008",
    pets: [{ name: "ปุยฝ้าย", species: "dog", breed: "มอลทีส", sex: "female", coatType: "long", weightGrams: 2_400 }],
  },
  {
    firstName: "ธนา",
    lastName: "เจริญผล",
    phone: "0810000009",
    pets: [
      { name: "ร็อคกี้", species: "dog", breed: "ไซบีเรียน ฮัสกี้", sex: "male", coatType: "double", weightGrams: 24_000 },
      { name: "สโนว์", species: "dog", breed: "ซามอยด์", sex: "female", coatType: "double", weightGrams: 21_500 },
    ],
  },
  {
    firstName: "พิมพ์",
    lastName: "วงศ์ไทย",
    phone: "0810000010",
    pets: [{ name: "เมฆ", species: "cat", breed: "เมนคูน", sex: "male", coatType: "long", weightGrams: 7_300 }],
  },
];

/** breed names must come from 10 §6 (reference-data.json) */
function knownBreed(species: Species, name: string): string {
  if (!referenceData.breeds[species].includes(name)) throw new Error(`seed: breed "${name}" is not in reference-data.json (${species})`);
  return name;
}

/** amenity codes must come from 10 §6 (reference-data.json) */
function knownAmenity(code: string): string {
  if (!Object.hasOwn(referenceData.amenities, code)) throw new Error(`seed: amenity "${code}" is not in reference-data.json`);
  return code;
}

function ctxFor(now: Date, orgId: string | null, branchId: string | null, actor: RequestContext["actor"]): RequestContext {
  return {
    now,
    requestId: randomUUID(),
    actor,
    orgId,
    branchId,
    timezone: "Asia/Bangkok",
    supportAccessLogId: null,
    ip: null,
    userAgent: null,
  };
}

/** Seeds the sample shop into the current db (getDb). Returns null when it already exists. */
export async function seedDevShop(now: Date): Promise<DevShop | null> {
  const db = getDb();
  const [existing] = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, DEV_SHOP_SLUG));
  if (existing) return null;

  const owner = DEV_STAFF[0];
  if (!owner) throw new Error("seed: DEV_STAFF is empty");
  const created = await adminCreateOrg(ctxFor(now, null, null, { type: "admin", id: null }), {
    name: "ร้านตัวอย่าง PJ-8",
    slug: DEV_SHOP_SLUG,
    branchName: "ร้านตัวอย่าง PJ-8",
    bookingSlug: DEV_SHOP_SLUG,
    ownerEmail: owner.email,
    ownerName: owner.displayName,
    modules: { grooming: true, hotel: true, daycare: true },
  });
  const orgId = created.organization.id;
  const sysCtx = ctxFor(now, orgId, null, { type: "system", id: null });
  const scoped = tenantDb(sysCtx, db);
  const [br] = (await scoped.select(branch)) as (typeof branch.$inferSelect)[];
  if (!br) throw new Error("seed: branch missing after admin.createOrg");

  // staff: the owner from admin.createOrg becomes active (invite accepted); the others are added active with the dev password
  const passwordHash = await hashPassword(DEV_PASSWORD);
  const [ownerRow] = (await scoped.select(staffUser, eq(staffUser.email, owner.email))) as (typeof staffUser.$inferSelect)[];
  if (!ownerRow) throw new Error("seed: owner missing after admin.createOrg");
  await scoped.update(staffUser, { status: "active", passwordHash, updatedAt: now }, eq(staffUser.id, ownerRow.id));
  await scoped.update(staffInvite, { acceptedAt: now }, and(eq(staffInvite.staffUserId, ownerRow.id), isNull(staffInvite.acceptedAt)));
  const staff: Record<string, string> = { [owner.key]: ownerRow.id };
  for (const [i, s] of DEV_STAFF.slice(1).entries()) {
    const [row] = (await scoped.insert(staffUser, {
      email: s.email,
      displayName: s.displayName,
      role: s.role,
      isGroomer: s.isGroomer,
      passwordHash,
      status: "active",
      sortOrder: i + 1,
      createdAt: now,
      updatedAt: now,
    })) as (typeof staffUser.$inferSelect)[];
    if (!row) throw new Error(`seed: staff ${s.key}`);
    staff[s.key] = row.id;
    if (s.isGroomer) {
      await scoped.insert(
        staffWorkingHours,
        [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
          branchId: br.id,
          staffUserId: row.id,
          weekday,
          startsAt: "09:00",
          endsAt: "18:00",
          breakStartsAt: "12:00",
          breakEndsAt: "13:00",
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
  }
  const ownerCtx = ctxFor(now, orgId, br.id, { type: "staff", id: ownerRow.id, role: "owner" });

  // grooming services with a price for every size tier of both species
  const tiers = (await scoped.select(sizeTier, eq(sizeTier.branchId, br.id))) as (typeof sizeTier.$inferSelect)[];
  const serviceIds: string[] = [];
  for (const [i, s] of SERVICES.entries()) {
    const svc = await servicesCreate(ownerCtx, {
      scope: "grooming",
      category: s.category,
      nameTh: s.nameTh,
      speciesAllowed: ["dog", "cat"],
      isAddon: s.isAddon,
      sortOrder: i + 1,
    });
    const prices = tiers.map((tier) => {
      const entry = s.prices[tier.species as Species]?.[tier.code];
      if (!entry) throw new Error(`seed: no ${s.nameTh} price for ${tier.species} ${tier.code}`);
      return { sizeTierId: tier.id, coatGroup: "any" as const, priceSatang: entry[0], durationMinutes: entry[1] };
    });
    await servicesSetPrices(ownerCtx, { serviceId: svc.id, prices });
    serviceIds.push(svc.id);
  }

  // hotel: 2 room types, 6 rooms, one nightly rate (every size) on the default rate plan
  const roomTypeIds: string[] = [];
  const units: { roomTypeId: string; code: string; status: "active"; sortOrder: number }[] = [];
  const ratePlanId = await defaultRatePlanId(sysCtx, db, br.id);
  for (const [i, rt] of ROOM_TYPES.entries()) {
    const [row] = (await scoped.insert(roomType, {
      branchId: br.id,
      nameTh: rt.nameTh,
      speciesAllowed: ["dog", "cat"],
      amenities: rt.amenities.map(knownAmenity),
      sortOrder: i + 1,
      createdAt: now,
      updatedAt: now,
    })) as (typeof roomType.$inferSelect)[];
    if (!row) throw new Error(`seed: room type ${rt.nameTh}`);
    await scoped.insert(roomRate, {
      roomTypeId: row.id,
      ratePlanId,
      nightlyPriceSatang: rt.nightlyPriceSatang,
      createdAt: now,
      updatedAt: now,
    });
    roomTypeIds.push(row.id);
    for (const code of rt.units) units.push({ roomTypeId: row.id, code, status: "active", sortOrder: units.length + 1 });
  }
  const roomUnitIds = (await roomUnitsUpsert(ownerCtx, { units })).map((u) => u.id);

  // daycare: the 3 sessions, one price each (every size)
  const daycareSessionTypeIds = (
    await daycareTypesUpsert(ownerCtx, {
      items: DAYCARE_SESSIONS.map((d) => ({
        session: d.session,
        nameTh: d.nameTh,
        startsAt: d.startsAt,
        endsAt: d.endsAt,
        capacity: d.capacity,
        status: "active" as const,
        rates: [{ priceSatang: d.priceSatang }],
      })),
    })
  ).map((d) => d.id);

  // customers and their pets
  const customerIds: string[] = [];
  const petIds: string[] = [];
  for (const c of CUSTOMERS) {
    const cust = await customersCreate(ownerCtx, {
      firstName: c.firstName,
      lastName: c.lastName,
      phone: c.phone,
      sourceChannel: "walk_in",
      photoConsent: "granted",
    });
    customerIds.push(cust.id);
    for (const p of c.pets) {
      const created = await petsCreate(ownerCtx, {
        customerId: cust.id,
        name: p.name,
        species: p.species,
        breed: knownBreed(p.species, p.breed),
        sex: p.sex,
        coatType: p.coatType,
        weightGrams: p.weightGrams,
      });
      petIds.push(created.id);
    }
  }

  return { orgId, branchId: br.id, staff, serviceIds, roomTypeIds, roomUnitIds, daycareSessionTypeIds, customerIds, petIds };
}

async function defaultRatePlanId(ctx: RequestContext, db: AppDb, branchId: string): Promise<string> {
  const [plan] = (await tenantDb(ctx, db).select(
    ratePlan,
    and(eq(ratePlan.branchId, branchId), eq(ratePlan.isDefault, true)),
  )) as (typeof ratePlan.$inferSelect)[];
  if (!plan) throw new Error("seed: default rate plan missing after admin.createOrg");
  return plan.id;
}

/** CLI entry: the seed is its own "job", so it takes the current time here (01 §4). */
async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  // admin.createOrg builds the (unused) owner invite link from APP_BASE_URL
  process.env.APP_BASE_URL ??= "http://localhost:3000";
  const shop = await seedDevShop(new Date());
  if (!shop) console.warn(`seed: "${DEV_SHOP_SLUG}" already exists — nothing to do`);
  else
    console.warn(
      `seed: "${DEV_SHOP_SLUG}" created — ${Object.keys(shop.staff).length} staff, ${shop.serviceIds.length} services, ` +
        `${shop.roomUnitIds.length} rooms, ${shop.daycareSessionTypeIds.length} daycare sessions, ` +
        `${shop.customerIds.length} customers, ${shop.petIds.length} pets. Staff sign in with DEV_PASSWORD from this file.`,
    );
  setDb(null);
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
