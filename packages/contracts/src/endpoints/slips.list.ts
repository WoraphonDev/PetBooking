import { z } from "zod";
import { SlipItem } from "../dto/slip-item.ts";
import { slipStatus } from "../enums.ts";

export const SlipsListQuery = z.object({ status: slipStatus.default("submitted") });
export type SlipsListQuery = z.infer<typeof SlipsListQuery>;
export const SlipsListRequest = SlipsListQuery;
export type SlipsListRequest = SlipsListQuery;
export const SlipsListResponse = z.array(SlipItem);
export type SlipsListResponse = z.infer<typeof SlipsListResponse>;
