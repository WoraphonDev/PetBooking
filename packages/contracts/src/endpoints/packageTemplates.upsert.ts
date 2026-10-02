import { z } from "zod";
import { Uuid } from "../common.ts";
import { PackageTemplateItem } from "../dto/package-template-item.ts";
import { packageShareScope, recordStatus } from "../enums.ts";

const PackageTemplateInput = z.object({
  id: Uuid.optional(),
  nameTh: z.string().trim().min(1),
  serviceId: Uuid,
  sizeTierId: Uuid.nullable().optional(),
  sessionsCount: z.number().int().min(2).max(50),
  priceSatang: z.number().int().min(1),
  validityDays: z.number().int().min(1).max(730),
  shareScope: packageShareScope,
  status: recordStatus,
});

export const PackageTemplatesUpsertRequest = z.object({ items: z.array(PackageTemplateInput) }).superRefine((b, issue) => {
  const ids = new Set<string>();
  b.items.forEach((t, i) => {
    if (t.id && ids.has(t.id)) issue.addIssue({ code: "custom", path: ["items", i, "id"], message: "duplicate id" });
    if (t.id) ids.add(t.id);
  });
});
export type PackageTemplatesUpsertRequest = z.infer<typeof PackageTemplatesUpsertRequest>;
export const PackageTemplatesUpsertResponse = z.array(PackageTemplateItem);
export type PackageTemplatesUpsertResponse = z.infer<typeof PackageTemplatesUpsertResponse>;
