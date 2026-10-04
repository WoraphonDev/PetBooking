import { z } from "zod";
import { LocalDate } from "../common.ts";
import { StayCard } from "../dto/stay-card.ts";

export const StaysTodayQuery = z.strictObject({ date: LocalDate, type: z.enum(["arrivals", "departures", "in_house"]).optional() });
export const StaysTodayRequest = StaysTodayQuery;
export type StaysTodayRequest = z.infer<typeof StaysTodayRequest>;
export const StaysTodayResponse = z.array(StayCard);
export type StaysTodayResponse = z.infer<typeof StaysTodayResponse>;
