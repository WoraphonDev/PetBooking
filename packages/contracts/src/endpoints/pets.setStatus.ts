import { z } from "zod";
import { Uuid, Warning } from "../common.ts";
import { PetDetail } from "../dto/pet-detail.ts";
import { petStatus } from "../enums.ts";

export const PetsSetStatusParams = z.object({ petId: Uuid });
export const PetsSetStatusRequest = z.object({ status: petStatus, note: z.string().max(500).optional() });
export type PetsSetStatusRequest = z.infer<typeof PetsSetStatusRequest>;
/** 05: future bookings are not cancelled — warning FUTURE_BOOKINGS, data { bookingIds } (Q-0105) */
export const PetsSetStatusResponse = PetDetail.extend({ warnings: z.array(Warning).optional() });
export type PetsSetStatusResponse = z.infer<typeof PetsSetStatusResponse>;
