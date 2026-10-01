// Minimal org fixture for server tests: org + branch + owner/front_desk/staff + one customer.

import type { StaffRole } from "@app/contracts/enums";
import { branch, customer, organization, ownerProfile, staffUser } from "@app/db/schema";
import type { AppDb } from "../../src/db.ts";

export type SeedOrg = {
  orgId: string;
  branchId: string;
  staff: Record<StaffRole, string>;
  ownerProfileId: string;
  customerId: string;
};

export async function seedOrg(db: AppDb, label: string): Promise<SeedOrg> {
  const [org] = await db
    .insert(organization)
    .values({ name: `Shop ${label}`, slug: `shop-${label}`, status: "active" })
    .returning();
  if (!org) throw new Error("seed: organization");
  const orgId = org.id;
  const [br] = await db
    .insert(branch)
    .values({ organizationId: orgId, name: `Shop ${label}`, bookingSlug: `shop-${label}` })
    .returning();
  if (!br) throw new Error("seed: branch");
  const roles: StaffRole[] = ["owner", "front_desk", "staff"];
  const staffRows = await db
    .insert(staffUser)
    .values(
      roles.map((role) => ({ organizationId: orgId, email: `${role}@${label}.test`, displayName: role, role, status: "active" as const })),
    )
    .returning();
  const staff = Object.fromEntries(staffRows.map((s) => [s.role, s.id])) as Record<StaffRole, string>;
  const [owner] = await db
    .insert(ownerProfile)
    .values({ createdInOrgId: orgId, firstName: `Owner ${label}` })
    .returning();
  if (!owner) throw new Error("seed: owner_profile");
  const [cust] = await db.insert(customer).values({ organizationId: orgId, ownerProfileId: owner.id }).returning();
  if (!cust) throw new Error("seed: customer");
  return { orgId, branchId: br.id, staff, ownerProfileId: owner.id, customerId: cust.id };
}

export const seedBase = (db: AppDb) => seedOrg(db, "a");
/** Second organization for "other org → NOT_FOUND" tests. */
export const otherOrg = (db: AppDb) => seedOrg(db, "b");
