import { LiffUpdatePetParams, LiffUpdatePetRequest } from "@app/contracts/endpoints/liff.updatePet";
import { withCustomer } from "@app/server/http";
import { liffUpdatePet } from "@app/server/services/liff/updatePet";

export const PATCH = withCustomer("liff.updatePet", { params: LiffUpdatePetParams, body: LiffUpdatePetRequest }, liffUpdatePet);
