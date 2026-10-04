import { PetsGetRequest } from "@app/contracts/endpoints/pets.get";
import { PetsUpdateParams, PetsUpdateRequest } from "@app/contracts/endpoints/pets.update";
import { withStaff } from "@app/server/http";
import { petsGet } from "@app/server/services/pets/get";
import { petsUpdate } from "@app/server/services/pets/update";
export const GET = withStaff("pets.get", { params: PetsGetRequest }, petsGet);
export const PATCH = withStaff("pets.update", { params: PetsUpdateParams, body: PetsUpdateRequest }, petsUpdate);
