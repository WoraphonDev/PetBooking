import { AdminOrgsRequest } from "@app/contracts/endpoints/admin.orgs";
import { withAdmin } from "@app/server/http";
import { adminOrgs } from "@app/server/services/admin/orgs";

export const GET = withAdmin("admin.orgs", { query: AdminOrgsRequest }, adminOrgs);
