import { z } from "zod";
import { IsoInstant, Uuid } from "../common.ts";
import { lineChannelStatus, orgStatus } from "../enums.ts";

export const OrgListItem = z.object({
  id: Uuid,
  name: z.string(),
  slug: z.string(),
  status: orgStatus,
  branchName: z.string(),
  bookingSlug: z.string(),
  ownerEmail: z.string().email().nullable(),
  lineStatus: lineChannelStatus.nullable(),
  createdAt: IsoInstant,
  lastActivityAt: IsoInstant.nullable(),
});
export type OrgListItem = z.infer<typeof OrgListItem>;
