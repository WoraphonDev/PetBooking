"use client";
import type { BranchSettings } from "@app/contracts/dto/branch-settings";
import { BranchGetResponse } from "@app/contracts/endpoints/branch.get";
import { type BranchSetModulesRequest, BranchSetModulesResponse } from "@app/contracts/endpoints/branch.setModules";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { Switch } from "../ui/switch";

type T = ReturnType<typeof useTranslations<"C-32">>;
type Modules = BranchSettings["modules"];
export type ModuleWarning = BranchSetModulesResponse["warnings"][number];
export const MODULES = ["grooming", "hotel", "daycare"] as const;

/** branch.setModules body: only the modules that changed; null when nothing changed */
export function setModulesBody(saved: Modules, draft: Modules): BranchSetModulesRequest | null {
  const body: BranchSetModulesRequest = {};
  for (const m of MODULES) if (saved[m] !== draft[m]) body[m] = draft[m];
  return Object.keys(body).length ? body : null;
}

/** 06#scr-C-32 — owner switches grooming / hotel / daycare on and off. */
export function ModulesScreen() {
  const t = useTranslations("C-32");
  const common = useTranslations("common");
  const branch = useApiQuery("branch.get", { response: BranchGetResponse });
  const [draft, setDraft] = useState<Modules | null>(null);
  const [warnings, setWarnings] = useState<ModuleWarning[]>([]);
  const save = useApiMutation("branch.setModules", { response: BranchSetModulesResponse, invalidate: ["branch.get"] });

  if (branch.isPending) return <Skeleton className="m-6 h-48" />;
  if (branch.isError)
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p role="alert">{errorMessage(branch.error)}</p>
        <Button type="button" onClick={() => void branch.refetch()}>
          {common("retry")}
        </Button>
      </div>
    );
  const modules = draft ?? branch.data.modules;
  const body = setModulesBody(branch.data.modules, modules);
  return (
    <ModulesForm
      t={t}
      modules={modules}
      onChange={setDraft}
      canSave={!!body && !save.isPending}
      onSave={async () => {
        if (!body) return;
        const result = await save.mutateAsync({ body });
        setDraft(null);
        // หลังสำเร็จ: warnings ใบจองค้าง
        setWarnings(result.warnings);
        toast.success(t("saved"));
      }}
      warnings={warnings}
    />
  );
}

export function ModulesForm(props: {
  t: T;
  modules: Modules;
  onChange: (m: Modules) => void;
  canSave: boolean;
  onSave: () => void;
  warnings: ModuleWarning[];
}) {
  const { t, modules } = props;
  return (
    <div data-screen="C-32" className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>
      <section className="flex flex-col gap-2 rounded-xl border p-4">
        <h2 className="font-medium text-lg">{t("sectionModules")}</h2>
        {MODULES.map((m) => (
          <label
            key={m}
            htmlFor={`c32-${m}`}
            className="flex min-h-11 items-center justify-between gap-4 border-t py-2 first-of-type:border-t-0"
          >
            <span className="flex flex-col">
              <span className="font-medium">{t(m)}</span>
              {m === "grooming" ? <span className="text-muted-foreground text-sm">{t("groomingHelp")}</span> : null}
            </span>
            <Switch id={`c32-${m}`} checked={modules[m]} onCheckedChange={(on) => props.onChange({ ...modules, [m]: on })} />
          </label>
        ))}
      </section>
      {props.warnings.length ? (
        <div role="status" className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
          <p className="font-medium">{t("warningsTitle")}</p>
          <ul className="list-disc pl-5">
            {props.warnings.map((w) => (
              <li key={w.data.module}>{t("warningLine", { module: enumLabel("service_scope", w.data.module), message: w.message })}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex justify-end">
        <Button type="button" className="h-11" disabled={!props.canSave} onClick={props.onSave}>
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
