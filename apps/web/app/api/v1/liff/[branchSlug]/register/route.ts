import { LiffRegisterParams, LiffRegisterRequest } from "@app/contracts/endpoints/liff.register";
import { withCustomer } from "@app/server/http";
import { liffRegister } from "@app/server/services/liff/register";

export const POST = withCustomer("liff.register", { params: LiffRegisterParams, body: LiffRegisterRequest }, liffRegister);
