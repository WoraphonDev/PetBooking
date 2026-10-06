import { LiffPayPageParams } from "@app/contracts/endpoints/liff.payPage";
import { withCustomer } from "@app/server/http";
import { liffPayPage } from "@app/server/services/liff/payPage";

export const GET = withCustomer("liff.payPage", { params: LiffPayPageParams }, liffPayPage);
