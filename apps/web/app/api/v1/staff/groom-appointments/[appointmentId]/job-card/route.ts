import { GroomJobCardParams } from "@app/contracts/endpoints/groom.jobCard";
import { withStaff } from "@app/server/http";
import { groomJobCard } from "@app/server/services/groom/jobCard";

export const GET = withStaff("groom.jobCard", { params: GroomJobCardParams }, groomJobCard);
