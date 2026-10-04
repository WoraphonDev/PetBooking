import { z } from "zod";
import { Uuid } from "../common.ts";
import { StayDetail } from "../dto/stay-detail.ts";

export const StaysGetParams = z.object({ stayId: Uuid });
export const StaysGetRequest = StaysGetParams;
export type StaysGetRequest = z.infer<typeof StaysGetRequest>;
export const StaysGetResponse = StayDetail;
export type StaysGetResponse = z.infer<typeof StaysGetResponse>;
