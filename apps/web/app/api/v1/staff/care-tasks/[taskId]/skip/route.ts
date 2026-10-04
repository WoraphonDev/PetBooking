import { CareTasksSkipParams, CareTasksSkipRequest } from "@app/contracts/endpoints/careTasks.skip";
import { withStaff } from "@app/server/http";
import { careTasksSkip } from "@app/server/services/careTasks/skip";

export const POST = withStaff("careTasks.skip", { body: CareTasksSkipRequest, params: CareTasksSkipParams }, careTasksSkip);
