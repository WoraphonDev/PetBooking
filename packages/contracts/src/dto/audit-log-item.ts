import { z } from "zod";
import { IsoInstant, Uuid } from "../common.ts";
import { actorType } from "../enums.ts";

export const AuditLogItem = z.object({
  id: Uuid,
  action: z.string(),
  actorType,
  /** staff_user / platform_admin display name; null for customer/system actors or a removed actor */
  actorName: z.string().nullable(),
  entityType: z.string(),
  entityId: Uuid.nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  reason: z.string().nullable(),
  at: IsoInstant,
  viaSupport: z.boolean(),
});
export type AuditLogItem = z.infer<typeof AuditLogItem>;
