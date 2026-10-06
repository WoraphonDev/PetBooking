import { z } from "zod";
import { MyPet } from "../dto/my-pet.ts";

export const LiffPetsParams = z.object({ branchSlug: z.string().min(1) });
export const LiffPetsRequest = LiffPetsParams;
export type LiffPetsRequest = z.infer<typeof LiffPetsRequest>;
export const LiffPetsResponse = z.array(MyPet);
export type LiffPetsResponse = z.infer<typeof LiffPetsResponse>;
