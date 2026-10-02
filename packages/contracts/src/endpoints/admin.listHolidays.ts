import { z } from "zod";
import { PublicHoliday } from "../dto/public-holiday.ts";
import { AdminHolidaysParams } from "./admin.holidays.ts";
export const AdminListHolidaysParams = AdminHolidaysParams;
export type AdminListHolidaysParams = z.infer<typeof AdminListHolidaysParams>;
export const AdminListHolidaysRequest = z.strictObject({});
export type AdminListHolidaysRequest = z.infer<typeof AdminListHolidaysRequest>;
export const AdminListHolidaysResponse = z.array(PublicHoliday);
export type AdminListHolidaysResponse = z.infer<typeof AdminListHolidaysResponse>;
