import { PetsCreateParams, PetsCreateRequest } from "@app/contracts/endpoints/pets.create";
import { withStaff } from "@app/server/http";
import { petsCreate } from "@app/server/services/pets/create";
export const POST = withStaff("pets.create", { params: PetsCreateParams, body: PetsCreateRequest }, petsCreate);
