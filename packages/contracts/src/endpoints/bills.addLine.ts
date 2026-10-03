import { z } from "zod";
import { Money, Uuid } from "../common.ts";
import { BillDetail } from "../dto/bill-detail.ts";

export const BillsAddLineParams = z.object({ billId: Uuid });
export const BillsAddLineRequest = z
  .object({
    lineType: z.enum(["quick_item", "package_sale", "package_redemption"]),
    /** quick_item: required, 1–80 */
    description: z.string().trim().min(1).max(80).optional(),
    quantity: z.number().int().min(1).max(999).optional(),
    /** quick_item: required, ≥ 0 */
    unitPriceSatang: Money.nonnegative().optional(),
    packageTemplateId: Uuid.optional(),
    customerPackageId: Uuid.optional(),
    petId: Uuid.optional(),
    performerId: Uuid.optional(),
  })
  .superRefine((v, ctx) => {
    const need = (path: keyof typeof v, ok: boolean, message: string) => {
      if (!ok) ctx.addIssue({ code: "custom", path: [path], message });
    };
    if (v.lineType === "quick_item") {
      need("description", v.description !== undefined, "required for quick_item");
      need("unitPriceSatang", v.unitPriceSatang !== undefined, "required for quick_item");
    }
    need(
      "packageTemplateId",
      (v.packageTemplateId !== undefined) === (v.lineType === "package_sale"),
      "package_sale only, and required there",
    );
    need(
      "customerPackageId",
      (v.customerPackageId !== undefined) === (v.lineType === "package_redemption"),
      "package_redemption only, and required there",
    );
    if (v.lineType === "package_redemption") need("petId", v.petId !== undefined, "required for package_redemption");
    // Q-0072: one package per line
    if (v.lineType !== "quick_item") need("quantity", v.quantity === undefined || v.quantity === 1, "packages are one per line");
  });
export type BillsAddLineRequest = z.infer<typeof BillsAddLineRequest>;
export const BillsAddLineResponse = BillDetail;
export type BillsAddLineResponse = z.infer<typeof BillsAddLineResponse>;
