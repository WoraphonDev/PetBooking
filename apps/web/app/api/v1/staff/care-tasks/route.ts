import { CareTasksListQuery } from "@app/contracts/endpoints/careTasks.list";
import { withStaff } from "@app/server/http";
import { careTasksList } from "@app/server/services/careTasks/list";

export const GET = withStaff("careTasks.list", { query: CareTasksListQuery }, careTasksList);
