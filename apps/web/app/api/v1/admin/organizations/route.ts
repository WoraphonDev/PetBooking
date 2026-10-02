import { AdminCreateOrgRequest } from "@app/contracts/endpoints/admin.createOrg";
import { AdminOrgsRequest } from "@app/contracts/endpoints/admin.orgs";
import { withAdmin } from "@app/server/http";
import { adminCreateOrg } from "@app/server/services/admin/createOrg";
import { adminOrgs } from "@app/server/services/admin/orgs";

export const GET = withAdmin("admin.orgs", { query: AdminOrgsRequest }, adminOrgs);
export const POST = withAdmin("admin.createOrg", { body: AdminCreateOrgRequest }, adminCreateOrg);
