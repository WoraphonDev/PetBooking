import { z } from "zod";
import { LineStatus } from "../dto/line-status.ts";

export const LineStatusRequest = z.strictObject({});
export type LineStatusRequest = z.infer<typeof LineStatusRequest>;
export const LineStatusResponse = LineStatus;
export type LineStatusResponse = z.infer<typeof LineStatusResponse>;
