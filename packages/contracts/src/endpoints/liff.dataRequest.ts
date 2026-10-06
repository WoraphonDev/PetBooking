import { z } from "zod";
import { dataRequestType } from "../enums.ts";

export const LiffDataRequestParams = z.object({ branchSlug: z.string().min(1) });
export const LiffDataRequestRequest = z.object({ type: dataRequestType }).strict();
export type LiffDataRequestRequest = z.infer<typeof LiffDataRequestRequest>;
/** 204 No Content */
export const LiffDataRequestResponse = z.undefined();
export type LiffDataRequestResponse = z.infer<typeof LiffDataRequestResponse>;
