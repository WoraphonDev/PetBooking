import { ServicesSetAddonLinksParams, ServicesSetAddonLinksRequest } from "@app/contracts/endpoints/services.setAddonLinks";
import { withStaff } from "@app/server/http";
import { servicesSetAddonLinks } from "@app/server/services/services/setAddonLinks";
export const PUT = withStaff(
  "services.setAddonLinks",
  { params: ServicesSetAddonLinksParams, body: ServicesSetAddonLinksRequest },
  servicesSetAddonLinks,
);
