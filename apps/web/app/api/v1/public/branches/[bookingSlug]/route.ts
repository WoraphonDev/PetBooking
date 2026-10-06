import { PublicBranchParams } from "@app/contracts/endpoints/public.branch";
import { type RouteContext, withPublic } from "@app/server/http";
import { publicBranch } from "@app/server/services/public/branch";

const handler = withPublic("public.branch", { params: PublicBranchParams }, publicBranch);

/** 05#ep-public.branch: cache 60 วินาที (also for browsers / CDN) */
export const GET = async (req: Request, context?: RouteContext) => {
  const res = await handler(req, context);
  if (res.ok) res.headers.set("cache-control", "public, max-age=60");
  return res;
};
