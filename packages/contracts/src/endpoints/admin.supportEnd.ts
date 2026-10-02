import { z } from "zod";
import { Uuid } from "../common.ts";

export const AdminSupportEndRequest = z.object({ supportId: Uuid });
export type AdminSupportEndRequest = z.infer<typeof AdminSupportEndRequest>;
export const AdminSupportEndResponse = z.undefined();
export type AdminSupportEndResponse = z.infer<typeof AdminSupportEndResponse>;
