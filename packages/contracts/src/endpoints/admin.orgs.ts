import { z } from "zod";
import { OrgListItem } from "../dto/org-list-item.ts";

export const AdminOrgsRequest = z.object({});
export type AdminOrgsRequest = z.infer<typeof AdminOrgsRequest>;
export const AdminOrgsResponse = z.array(OrgListItem);
export type AdminOrgsResponse = z.infer<typeof AdminOrgsResponse>;
