import { ImportsCreateRequest } from "@app/contracts/endpoints/imports.create";
import { withStaff } from "@app/server/http";
import { importsCreate } from "@app/server/services/imports/create";

export const POST = withStaff("imports.create", { body: ImportsCreateRequest }, importsCreate);
