import { z } from "zod";
import { OrgListItem } from "../dto/org-list-item.ts";

const Slug = z.string().regex(/^[a-z0-9-]{3,40}$/);

export const AdminCreateOrgRequest = z.object({
  name: z.string().trim().min(1),
  slug: Slug,
  branchName: z.string().trim().min(1),
  bookingSlug: Slug,
  ownerEmail: z
    .string()
    .trim()
    .email()
    .transform((email) => email.toLowerCase()),
  ownerName: z.string().trim().min(1),
  modules: z.object({ grooming: z.boolean(), hotel: z.boolean(), daycare: z.boolean() }),
});
export type AdminCreateOrgRequest = z.infer<typeof AdminCreateOrgRequest>;
export const AdminCreateOrgResponse = z.object({ organization: OrgListItem, ownerInviteUrl: z.string().url() });
export type AdminCreateOrgResponse = z.infer<typeof AdminCreateOrgResponse>;
