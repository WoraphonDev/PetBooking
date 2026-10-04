import { z } from "zod";
import { Uuid } from "../common.ts";
import { StayCard } from "../dto/stay-card.ts";

export const StaysNoShowParams = z.object({ stayId: Uuid });
export const StaysNoShowRequest = StaysNoShowParams;
export type StaysNoShowRequest = z.infer<typeof StaysNoShowRequest>;
export const StaysNoShowResponse = StayCard;
export type StaysNoShowResponse = z.infer<typeof StaysNoShowResponse>;
