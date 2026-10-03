"use client";

import type { SizeTierItem } from "@app/contracts/dto/size-tier-item";
import { SizeTiersListResponse } from "@app/contracts/endpoints/sizeTiers.list";
import { SizeTiersSetRequest, SizeTiersSetResponse } from "@app/contracts/endpoints/sizeTiers.set";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ApiClientError, errorMessage } from "../../lib/api";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { FormField, WeightInput } from "../shared/form";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

type Species = "dog" | "cat";
type Draft = Pick<SizeTierItem, "id" | "code" | "labelTh"> & {
  minWeightGrams: number | null | undefined;
  maxWeightGrams: number | null | undefined;
};

export function SizeTierFields({
  row,
  index,
  invalid,
  onChange,
}: {
  row: Draft;
  index: number;
  invalid: boolean;
  onChange: (row: Draft) => void;
}) {
  const t = useTranslations("C-38");
  const id = `tier-${index}`;
  return (
    <fieldset aria-invalid={invalid} className={`grid gap-4 rounded-lg border p-4 md:grid-cols-4 ${invalid ? "border-destructive" : ""}`}>
      <FormField id={`${id}-code`} label={t("code")}>
        <Input
          id={`${id}-code`}
          className="h-11"
          value={row.code}
          pattern="[A-Z]{1,4}"
          required
          maxLength={4}
          onChange={(event) => onChange({ ...row, code: event.target.value })}
        />
      </FormField>
      <FormField id={`${id}-label`} label={t("label")}>
        <Input
          id={`${id}-label`}
          className="h-11"
          value={row.labelTh}
          required
          maxLength={30}
          onChange={(event) => onChange({ ...row, labelTh: event.target.value })}
        />
      </FormField>
      <FormField id={`${id}-min`} label={t("min")}>
        <WeightInput
          id={`${id}-min`}
          value={row.minWeightGrams ?? null}
          required
          aria-invalid={invalid}
          onValueChange={(minWeightGrams) => onChange({ ...row, minWeightGrams })}
        />
      </FormField>
      <FormField id={`${id}-max`} label={t("max")}>
        <WeightInput
          id={`${id}-max`}
          value={row.maxWeightGrams ?? null}
          aria-invalid={invalid}
          onValueChange={(maxWeightGrams) => onChange({ ...row, maxWeightGrams })}
        />
      </FormField>
    </fieldset>
  );
}

export function SizeTierEditor({ species, initialTiers }: { species: Species; initialTiers: SizeTierItem[] }) {
  const t = useTranslations("C-38");
  const [rows, setRows] = useState<Draft[]>(() =>
    initialTiers.map(({ id, code, labelTh, minWeightGrams, maxWeightGrams }) => ({ id, code, labelTh, minWeightGrams, maxWeightGrams })),
  );
  const [error, setError] = useState("");
  const [invalidRows, setInvalidRows] = useState<number[]>([]);
  const mutation = useApiMutation("sizeTiers.set", {
    response: SizeTiersSetResponse,
    invalidate: ["sizeTiers.list"],
    meta: { toast: false },
  });
  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (mutation.isPending) return;
        setError("");
        setInvalidRows([]);
        const parsed = SizeTiersSetRequest.safeParse({
          species,
          tiers: rows.map(({ id, code, labelTh, minWeightGrams, maxWeightGrams }) => ({
            id,
            code,
            labelTh,
            minWeightGrams,
            maxWeightGrams,
          })),
        });
        if (!parsed.success || rows.some((row) => row.maxWeightGrams === undefined)) {
          setError(t("validation"));
          return;
        }
        try {
          await mutation.mutateAsync({ body: parsed.data });
          setError(t("saved"));
        } catch (err) {
          setError(errorMessage(err));
          if (err instanceof ApiClientError && err.code === "SIZE_TIER_OVERLAP" && Array.isArray(err.details?.rows)) {
            setInvalidRows(
              err.details.rows.filter((index): index is number => Number.isInteger(index) && index >= 0 && index < rows.length),
            );
          }
        }
      }}
    >
      <fieldset disabled={mutation.isPending} className="grid gap-4">
        {rows.map((row, index) => (
          <SizeTierFields
            key={row.id}
            row={row}
            index={index}
            invalid={invalidRows.includes(index)}
            onChange={(next) => setRows((previous) => previous.map((value, i) => (i === index ? next : value)))}
          />
        ))}
      </fieldset>
      {error ? (
        <p role="status" aria-live="polite">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={mutation.isPending} className="h-11 justify-self-start">
        {t("save")}
      </Button>
    </form>
  );
}

export function SizeTierScreen() {
  const t = useTranslations("C-38");
  const [species, setSpecies] = useState<Species>("dog");
  const query = useApiQuery("sizeTiers.list", { response: SizeTiersListResponse });
  const tiers = query.data?.filter((tier) => tier.species === species).sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <section className="grid gap-6">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <div role="tablist" aria-label={t("title")} className="flex gap-2">
        {(["dog", "cat"] as const).map((value) => (
          <Button
            key={value}
            type="button"
            role="tab"
            aria-selected={species === value}
            aria-controls="tier-panel"
            id={`tab-${value}`}
            className="h-11"
            onClick={() => setSpecies(value)}
          >
            {t(value)}
          </Button>
        ))}
      </div>
      <div id="tier-panel" role="tabpanel" aria-labelledby={`tab-${species}`}>
        {query.isPending ? (
          <p role="status">{t("loading")}</p>
        ) : query.isError ? (
          <p role="alert">{errorMessage(query.error)}</p>
        ) : tiers ? (
          <SizeTierEditor key={`${species}:${JSON.stringify(tiers)}`} species={species} initialTiers={tiers} />
        ) : null}
      </div>
    </section>
  );
}
