import { PetsSetStatusParams, PetsSetStatusRequest } from "@app/contracts/endpoints/pets.setStatus";
import { withStaff } from "@app/server/http";
import { petsSetStatus } from "@app/server/services/pets/setStatus";

export const POST = withStaff("pets.setStatus", { body: PetsSetStatusRequest, params: PetsSetStatusParams }, petsSetStatus);
