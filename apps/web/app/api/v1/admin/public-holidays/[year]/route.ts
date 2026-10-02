import { AdminHolidaysParams, AdminHolidaysRequest } from "@app/contracts/endpoints/admin.holidays";
import { withAdmin } from "@app/server/http";
import { adminHolidays } from "@app/server/services/admin/holidays";

export const PUT = withAdmin("admin.holidays", { params: AdminHolidaysParams, body: AdminHolidaysRequest }, adminHolidays);
