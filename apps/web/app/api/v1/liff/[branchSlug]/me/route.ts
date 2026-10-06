import { LiffMeParams } from "@app/contracts/endpoints/liff.me";
import { LiffUpdateMeParams, LiffUpdateMeRequest } from "@app/contracts/endpoints/liff.updateMe";
import { withCustomer } from "@app/server/http";
import { liffMe } from "@app/server/services/liff/me";
import { liffUpdateMe } from "@app/server/services/liff/updateMe";

export const GET = withCustomer("liff.me", { params: LiffMeParams }, liffMe);

export const PATCH = withCustomer("liff.updateMe", { params: LiffUpdateMeParams, body: LiffUpdateMeRequest }, liffUpdateMe);
