import { StationsListRequest } from "@app/contracts/endpoints/stations.list";
import { StationsUpsertRequest } from "@app/contracts/endpoints/stations.upsert";
import { withStaff } from "@app/server/http";
import { stationsList } from "@app/server/services/stations/list";
import { stationsUpsert } from "@app/server/services/stations/upsert";

export const GET = withStaff("stations.list", { query: StationsListRequest }, stationsList);
export const PUT = withStaff("stations.upsert", { body: StationsUpsertRequest }, stationsUpsert);
