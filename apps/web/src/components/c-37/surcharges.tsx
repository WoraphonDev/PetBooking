"use client";
// 06#scr-C-37 ext-M2 — ค่าบริการเพิ่มหน้างาน (surchargeTypes.list / surchargeTypes.upsert).
import type { SurchargeTypeItem } from "@app/contracts/dto/surcharge-type-item";
import type { useTranslations } from "next-intl";
import { useState } from "react";
import { MoneyInput } from "../shared/form";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { invalidSurcharges, type SurchargeRow, surchargeRows, surchargesBody } from "./logic";

type T = ReturnType<typeof useTranslations<"C-37">>;

/** rows ชื่อ / ราคาตั้งต้น / ใช้งาน, เพิ่มรายการ, บันทึกค่าบริการเพิ่ม */
export function SurchargeSection(props: {
  t: T;
  items: SurchargeTypeItem[];
  busy: boolean;
  onSave: (body: NonNullable<ReturnType<typeof surchargesBody>>) => Promise<void>;
}) {
  const { t } = props;
  /** null = follow the loaded list */
  const [edited, setEdited] = useState<SurchargeRow[] | null>(null);
  const [touched, setTouched] = useState(false);
  const rows = edited ?? surchargeRows(props.items);
  const invalid = touched ? invalidSurcharges(rows) : [];
  const update = (key: string, next: Partial<SurchargeRow>) => setEdited(rows.map((r) => (r.key === key ? { ...r, ...next } : r)));
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="font-medium text-lg">{t("sectionSurcharges")}</h2>
      {rows.length === 0 ? <p className="text-muted-foreground text-sm">{t("noSurcharges")}</p> : null}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-2">{t("name")}</th>
            <th className="py-2">{t("defaultAmount")}</th>
            <th className="py-2">{t("statusActive")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key} className="border-t align-top">
              <td className="py-2 pr-2">
                <Input
                  aria-label={`${t("name")} ${i + 1}`}
                  aria-invalid={invalid.includes(r.key)}
                  className="h-11"
                  maxLength={60}
                  value={r.nameTh}
                  onChange={(e) => update(r.key, { nameTh: e.target.value })}
                />
                {invalid.includes(r.key) ? (
                  <p role="alert" className="mt-1 text-destructive text-xs">
                    {t("invalid")}
                  </p>
                ) : null}
              </td>
              <td className="py-2 pr-2">
                <MoneyInput
                  aria-label={`${t("defaultAmount")} ${i + 1}`}
                  value={r.amountSatang ?? null}
                  onValueChange={(amountSatang) => update(r.key, { amountSatang })}
                />
              </td>
              <td className="py-2">
                <Switch
                  aria-label={`${t("statusActive")} ${i + 1}`}
                  checked={r.active}
                  onCheckedChange={(active) => update(r.key, { active })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => setEdited([...rows, { key: `new-${rows.length}`, id: null, nameTh: "", amountSatang: null, active: true }])}
        >
          {t("addSurcharge")}
        </Button>
        <Button
          type="button"
          className="h-11"
          disabled={props.busy}
          onClick={() => {
            setTouched(true);
            const body = surchargesBody(rows, props.items);
            if (body)
              void props
                .onSave(body)
                .then(() => {
                  setEdited(null);
                  setTouched(false);
                })
                .catch(() => {});
          }}
        >
          {t("saveSurcharges")}
        </Button>
      </div>
    </section>
  );
}
