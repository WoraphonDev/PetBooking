import { z } from "zod";
import { BranchSettings } from "../dto/branch-settings.ts";
export const BranchGetRequest = z.object({});
export type BranchGetRequest = z.infer<typeof BranchGetRequest>;
export const BranchGetResponse = BranchSettings;
export type BranchGetResponse = z.infer<typeof BranchGetResponse>;
