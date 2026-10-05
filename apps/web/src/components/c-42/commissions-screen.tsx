"use client";
import { CommissionRulesListResponse } from "@app/contracts/endpoints/commissionRules.list";
import { CommissionRulesSetResponse } from "@app/contracts/endpoints/commissionRules.set";
import { ServicesListResponse } from "@app/contracts/endpoints/services.list";
import { StaffUsersListResponse } from "@app/contracts/endpoints/staffUsers.list";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "../../lib/api";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { MoneyInput } from "../shared/form";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { bpsToPercentText, newRow, percentToBps, type RowError, type RuleRow, rowErrors, rowsOf, setBody } from "./logic";

type T = ReturnType<typeof useTranslations<"C-42">>;
type Option = { id: string; name: string };
const selectClass = "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm";

/** 06#scr-C-42 — owner sets commission rules (the most specific rule wins, R-13). */
export function CommissionsScreen() {
  const t = useTranslations("C-42");
  const common = useTranslations("common");
  const rules = useApiQuery("commissionRules.list", { response: CommissionRulesListResponse });
  const services = useApiQuery("services.list", { response: ServicesListResponse });
  const staff = useApiQuery("staffUsers.list", { response: StaffUsersListResponse });
  const [rows, setRows] = useState<RuleRow[] | null>(null);
  const [touched, setTouched] = useState(false);
  const save = useApiMutation("commissionRules.set", { response: CommissionRulesSetResponse, invalidate: ["commissionRules.list"] });

  if (rules.isPending || services.isPending || staff.isPending) return <Skeleton className="m-6 h-64" />;
  if (rules.isError || services.isError || staff.isError)
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p role="alert">{errorMessage(rules.error ?? services.error ?? staff.error)}</p>
        <Button
          type="button"
          onClick={() => {
            void rules.refetch();
            void services.refetch();
            void staff.refetch();
          }}
        >
          {common("retry")}
        </Button>
      </div>
    );

  const shown = rows ?? rowsOf(rules.data);
  return (
    <RulesForm
      t={t}
      rows={shown}
      onChange={setRows}
      services={services.data.map((s) => ({ id: s.id, name: s.nameTh }))}
      staff={staff.data.map((s) => ({ id: s.id, name: s.displayName }))}
      errors={touched ? rowErrors(shown) : {}}
      saving={save.isPending}
      onSave={async () => {
        setTouched(true);
        const body = setBody(shown);
        if (!body) return;
        await save.mutateAsync({ body });
        setRows(null);
        setTouched(false);
        toast.success(t("saved"));
      }}
    />
  );
}

export function RulesForm(props: {
  t: T;
  rows: RuleRow[];
  onChange: (rows: RuleRow[]) => void;
  services: Option[];
  staff: Option[];
  errors: Record<string, RowError>;
  saving: boolean;
  onSave: () => void;
}) {
  const { t, rows } = props;
  const update = (key: string, next: Partial<RuleRow>) => props.onChange(rows.map((r) => (r.key === key ? { ...r, ...next } : r)));
  return (
    <div data-screen="C-42" className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>
      <section className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="font-medium text-lg">{t("sectionRules")}</h2>
        {rows.length === 0 ? <p className="text-muted-foreground text-sm">{t("noRules")}</p> : null}
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2">{t("service")}</th>
              <th className="py-2">{t("staff")}</th>
              <th className="py-2">{t("type")}</th>
              <th className="py-2">{t("value")}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t align-top">
                <td className="py-2 pr-2">
                  <select
                    aria-label={t("service")}
                    className={selectClass}
                    value={r.serviceId ?? ""}
                    onChange={(e) => update(r.key, { serviceId: e.target.value || null })}
                  >
                    <option value="">{t("allServices")}</option>
                    {props.services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pr-2">
                  <select
                    aria-label={t("staff")}
                    className={selectClass}
                    value={r.staffUserId ?? ""}
                    onChange={(e) => update(r.key, { staffUserId: e.target.value || null })}
                  >
                    <option value="">{t("allStaff")}</option>
                    {props.staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pr-2">
                  <div role="radiogroup" aria-label={t("type")} className="flex gap-1">
                    {(["percent", "fixed"] as const).map((type) => (
                      <Button
                        key={type}
                        type="button"
                        role="radio"
                        aria-checked={r.type === type}
                        variant={r.type === type ? "default" : "outline"}
                        className="h-11 min-w-11"
                        onClick={() => r.type !== type && update(r.key, { type, value: 0 })}
                      >
                        {t(type === "percent" ? "typePercent" : "typeFixed")}
                      </Button>
                    ))}
                  </div>
                </td>
                <td className="py-2 pr-2">
                  {r.type === "fixed" ? (
                    <MoneyInput
                      aria-label={t("value")}
                      value={Number.isNaN(r.value) ? null : r.value}
                      onValueChange={(v) => update(r.key, { value: v === undefined ? Number.NaN : (v ?? 0) })}
                    />
                  ) : (
                    <PercentInput label={t("value")} value={r.value} onValue={(value) => update(r.key, { value })} />
                  )}
                  {props.errors[r.key] ? (
                    <p role="alert" className="mt-1 text-destructive text-xs">
                      {t(props.errors[r.key] === "duplicate" ? "duplicateRule" : "invalidValue")}
                    </p>
                  ) : null}
                </td>
                <td className="py-2 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11"
                    onClick={() => props.onChange(rows.filter((x) => x.key !== r.key))}
                  >
                    {t("removeRule")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button type="button" variant="outline" className="h-11 self-start" onClick={() => props.onChange([...rows, newRow()])}>
          {t("addRule")}
        </Button>
        <p data-field="precedence" className="text-muted-foreground text-sm">
          <span className="font-medium">{t("precedence")}: </span>
          {t("precedenceText")}
        </p>
      </section>
      <div className="flex justify-end">
        <Button type="button" className="h-11" disabled={props.saving} onClick={props.onSave}>
          {t("save")}
        </Button>
      </div>
    </div>
  );
}

/** % with 2 decimals, stored as basis points */
function PercentInput({ label, value, onValue }: { label: string; value: number; onValue: (bps: number) => void }) {
  const [text, setText] = useState(() => (Number.isNaN(value) ? "" : bpsToPercentText(value)));
  return (
    <div className="relative">
      <Input
        aria-label={label}
        inputMode="decimal"
        className="h-11 pr-8 text-right"
        value={text}
        aria-invalid={Number.isNaN(value)}
        onChange={(e) => {
          setText(e.target.value);
          const bps = percentToBps(e.target.value);
          onValue(bps === undefined ? Number.NaN : (bps ?? 0));
        }}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">%</span>
    </div>
  );
}
