import { AdminHolidaysParams, AdminHolidaysRequest } from "@app/contracts/endpoints/admin.holidays";
import { AdminListHolidaysParams } from "@app/contracts/endpoints/admin.listHolidays";
import { withAdmin } from "@app/server/http";
import { adminHolidays } from "@app/server/services/admin/holidays";
import { adminListHolidays } from "@app/server/services/admin/listHolidays";

export const PUT = withAdmin("admin.holidays", { params: AdminHolidaysParams, body: AdminHolidaysRequest }, adminHolidays);

export const GET = withAdmin("admin.listHolidays", { params: AdminListHolidaysParams }, adminListHolidays);
