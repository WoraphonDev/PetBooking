import { z } from "zod";
import { Uuid } from "../common.ts";
import { OrgListItem } from "../dto/org-list-item.ts";
import { orgStatus } from "../enums.ts";

export const AdminUpdateOrgParams = z.object({ orgId: Uuid });
export const AdminUpdateOrgRequest = z.object({ status: orgStatus });
export type AdminUpdateOrgRequest = z.infer<typeof AdminUpdateOrgRequest>;
export const AdminUpdateOrgResponse = OrgListItem;
export type AdminUpdateOrgResponse = z.infer<typeof AdminUpdateOrgResponse>;
