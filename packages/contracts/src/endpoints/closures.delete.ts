import { z } from "zod";
import { Uuid } from "../common.ts";

export const ClosuresDeleteRequest = z.object({ closureId: Uuid });
export type ClosuresDeleteRequest = z.infer<typeof ClosuresDeleteRequest>;
export const ClosuresDeleteResponse = z.undefined();
export type ClosuresDeleteResponse = z.infer<typeof ClosuresDeleteResponse>;
