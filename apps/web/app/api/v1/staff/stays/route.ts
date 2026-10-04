import { StaysTodayQuery } from "@app/contracts/endpoints/stays.today";
import { withStaff } from "@app/server/http";
import { staysToday } from "@app/server/services/stays/today";

export const GET = withStaff("stays.today", { query: StaysTodayQuery }, staysToday);
