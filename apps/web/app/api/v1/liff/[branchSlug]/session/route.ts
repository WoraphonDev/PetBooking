import { LiffSessionParams, LiffSessionRequest } from "@app/contracts/endpoints/liff.session";
import { withPublic } from "@app/server/http";
import { liffSession } from "@app/server/services/liff/session";

export const POST = withPublic("liff.session", { params: LiffSessionParams, body: LiffSessionRequest }, liffSession);
