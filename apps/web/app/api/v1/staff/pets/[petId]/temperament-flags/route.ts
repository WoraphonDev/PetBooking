import { PetsSetFlagsParams, PetsSetFlagsRequest } from "@app/contracts/endpoints/pets.setFlags";
import { withStaff } from "@app/server/http";
import { petsSetFlags } from "@app/server/services/pets/setFlags";

export const PUT = withStaff("pets.setFlags", { body: PetsSetFlagsRequest, params: PetsSetFlagsParams }, petsSetFlags);
