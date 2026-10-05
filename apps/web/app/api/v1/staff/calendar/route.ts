import { CalendarDayRequest } from "@app/contracts/endpoints/calendar.day";
import { withStaff } from "@app/server/http";
import { calendarDay } from "@app/server/services/calendar/day";

export const GET = withStaff("calendar.day", { query: CalendarDayRequest }, calendarDay);
