import { z } from "zod";
import { Uuid } from "../common.ts";
import { PetDetail } from "../dto/pet-detail.ts";
import { temperamentFlag } from "../enums.ts";

export const PetsSetFlagsParams = z.object({ petId: Uuid });
/** replaces this shop's whole set; each flag once, `note` required for other */
export const PetsSetFlagsRequest = z
  .object({
    flags: z.array(
      z
        .object({ flag: temperamentFlag, note: z.string().trim().max(200).optional() })
        .refine((f) => f.flag !== "other" || !!f.note, { path: ["note"], message: "note is required for other" }),
    ),
  })
  .refine((b) => new Set(b.flags.map((f) => f.flag)).size === b.flags.length, { path: ["flags"], message: "each flag once" });
export type PetsSetFlagsRequest = z.infer<typeof PetsSetFlagsRequest>;
export const PetsSetFlagsResponse = PetDetail;
export type PetsSetFlagsResponse = z.infer<typeof PetsSetFlagsResponse>;
