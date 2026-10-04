import { z } from "zod";
import { Uuid } from "../common.ts";
import { JobCard } from "../dto/job-card.ts";

export const GroomJobCardParams = z.object({ appointmentId: Uuid });
export const GroomJobCardRequest = GroomJobCardParams;
export type GroomJobCardRequest = z.infer<typeof GroomJobCardRequest>;
export const GroomJobCardResponse = JobCard;
export type GroomJobCardResponse = z.infer<typeof GroomJobCardResponse>;
