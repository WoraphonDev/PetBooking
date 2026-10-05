import { CareTasksDoneParams, CareTasksDoneRequest } from "@app/contracts/endpoints/careTasks.done";
import { withStaff } from "@app/server/http";
import { careTasksDone } from "@app/server/services/careTasks/done";

export const POST = withStaff("careTasks.done", { body: CareTasksDoneRequest, params: CareTasksDoneParams }, careTasksDone);
