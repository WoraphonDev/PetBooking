import { z } from "zod";
import { StaffUserItem, StaffUserPublicItem } from "../dto/staff-user-item.ts";

/** no query parameters */
export const StaffUsersListQuery = z.strictObject({});
export const StaffUsersListRequest = StaffUsersListQuery;
export type StaffUsersListRequest = z.infer<typeof StaffUsersListRequest>;
export const StaffUsersListResponse = z.array(z.union([StaffUserItem, StaffUserPublicItem]));
export type StaffUsersListResponse = z.infer<typeof StaffUsersListResponse>;
