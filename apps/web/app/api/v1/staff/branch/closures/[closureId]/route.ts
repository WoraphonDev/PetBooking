import { ClosuresDeleteRequest } from "@app/contracts/endpoints/closures.delete";
import { withStaff } from "@app/server/http";
import { closuresDelete } from "@app/server/services/closures/delete";

export const DELETE = withStaff("closures.delete", { params: ClosuresDeleteRequest }, closuresDelete);
