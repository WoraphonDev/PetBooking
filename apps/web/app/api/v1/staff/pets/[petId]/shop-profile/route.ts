import { PetsUpdateShopProfileParams, PetsUpdateShopProfileRequest } from "@app/contracts/endpoints/pets.updateShopProfile";
import { withStaff } from "@app/server/http";
import { petsUpdateShopProfile } from "@app/server/services/pets/updateShopProfile";

export const PUT = withStaff(
  "pets.updateShopProfile",
  { body: PetsUpdateShopProfileRequest, params: PetsUpdateShopProfileParams },
  petsUpdateShopProfile,
);
