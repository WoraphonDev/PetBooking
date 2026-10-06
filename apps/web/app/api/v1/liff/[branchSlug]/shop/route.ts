import { LiffShopParams } from "@app/contracts/endpoints/liff.shop";
import { withCustomer } from "@app/server/http";
import { liffShop } from "@app/server/services/liff/shop";

export const GET = withCustomer("liff.shop", { params: LiffShopParams }, liffShop);
