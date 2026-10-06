import { LiffCreatePetParams, LiffCreatePetRequest } from "@app/contracts/endpoints/liff.createPet";
import { LiffPetsParams } from "@app/contracts/endpoints/liff.pets";
import { withCustomer } from "@app/server/http";
import { liffCreatePet } from "@app/server/services/liff/createPet";
import { liffPets } from "@app/server/services/liff/pets";

export const GET = withCustomer("liff.pets", { params: LiffPetsParams }, liffPets);

export const POST = withCustomer("liff.createPet", { params: LiffCreatePetParams, body: LiffCreatePetRequest }, liffCreatePet);
