import { z } from "zod";
import { LocalDate, Uuid } from "../common.ts";
import { StayCard } from "../dto/stay-card.ts";

export const StaysChangeDatesParams = z.object({ stayId: Uuid });
/** checkInDate only while the stay is reserved; checkOutDate > check-in (both checked in the service) */
export const StaysChangeDatesRequest = z.object({ checkInDate: LocalDate.optional(), checkOutDate: LocalDate });
export type StaysChangeDatesRequest = z.infer<typeof StaysChangeDatesRequest>;
export const StaysChangeDatesResponse = StayCard;
export type StaysChangeDatesResponse = z.infer<typeof StaysChangeDatesResponse>;
