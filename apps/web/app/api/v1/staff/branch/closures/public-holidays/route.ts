import { ClosuresImportHolidaysRequest } from "@app/contracts/endpoints/closures.importHolidays";
import { withStaff } from "@app/server/http";
import { closuresImportHolidays } from "@app/server/services/closures/importHolidays";

export const POST = withStaff("closures.importHolidays", { body: ClosuresImportHolidaysRequest }, closuresImportHolidays);
