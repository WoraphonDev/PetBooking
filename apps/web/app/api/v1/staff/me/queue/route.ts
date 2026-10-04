import { GroomMyQueueQuery } from "@app/contracts/endpoints/groom.myQueue";
import { withStaff } from "@app/server/http";
import { groomMyQueue } from "@app/server/services/groom/myQueue";

export const GET = withStaff("groom.myQueue", { query: GroomMyQueueQuery }, groomMyQueue);
