import { PetsAddWeightParams, PetsAddWeightRequest } from "@app/contracts/endpoints/pets.addWeight";
import { withStaff } from "@app/server/http";
import { petsAddWeight } from "@app/server/services/pets/addWeight";

export const POST = withStaff("pets.addWeight", { body: PetsAddWeightRequest, params: PetsAddWeightParams }, petsAddWeight);
