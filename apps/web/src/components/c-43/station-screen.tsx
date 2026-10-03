"use client";
import { StationsListResponse } from "@app/contracts/endpoints/stations.list";
import { type StationsUpsertRequest as Request, StationsUpsertRequest } from "@app/contracts/endpoints/stations.upsert";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { errorMessage } from "../../lib/api";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { FormField } from "../shared/form";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

type Station = Request["stations"][number];
export function reorderStations<T extends { sortOrder: number }>(rows: T[], from: number, to: number): T[] {
  if (!Number.isInteger(from) || from < 0 || from >= rows.length || to < 0 || to >= rows.length) return rows;
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  if (!moved) return rows;
  next.splice(to, 0, moved);
  return next.map((row, sortOrder) => ({ ...row, sortOrder }));
}
export function StationFields({ station, onChange }: { station: Station; onChange: (station: Station) => void }) {
  const t = useTranslations("C-43");
  const id = `station-${station.sortOrder}`;
  return (
    <div className="grid flex-1 gap-4 md:grid-cols-2">
      <FormField id={id} label={t("name")}>
        <Input
          id={id}
          className="h-11"
          required
          maxLength={30}
          value={station.name}
          onChange={(event) => onChange({ ...station, name: event.target.value })}
        />
      </FormField>
      <Button
        type="button"
        role="switch"
        variant={station.status === "active" ? "default" : "outline"}
        aria-checked={station.status === "active"}
        className="h-11 self-end"
        onClick={() => onChange({ ...station, status: station.status === "active" ? "archived" : "active" })}
      >
        {t("active")}
      </Button>
    </div>
  );
}
export function StationEditor({ initialStations }: { initialStations: Station[] }) {
  const t = useTranslations("C-43");
  const [rows, setRows] = useState<Station[]>(() =>
    initialStations.map(({ id, name, sortOrder, status }) => ({ id, name, sortOrder, status })),
  );
  const [message, setMessage] = useState("");
  const mutation = useApiMutation("stations.upsert", { invalidate: ["stations.list"], meta: { toast: false } });
  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (mutation.isPending) return;
        const parsed = StationsUpsertRequest.safeParse({ stations: rows });
        if (!parsed.success) {
          setMessage(t("validation"));
          return;
        }
        setMessage("");
        try {
          await mutation.mutateAsync({ body: parsed.data });
          setMessage(t("saved"));
        } catch (error) {
          setMessage(errorMessage(error));
        }
      }}
    >
      {message ? <p role="status">{message}</p> : null}
      <fieldset disabled={mutation.isPending} className="grid gap-4">
        {rows.map((station, index) => (
          <fieldset
            key={station.id ?? `new-${index}`}
            aria-label={`${t("order")} ${index + 1}`}
            className="flex gap-4 rounded-lg border p-4"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (mutation.isPending) return;
              const source = event.dataTransfer.getData("text/plain");
              if (/^\d+$/.test(source)) setRows((previous) => reorderStations(previous, Number(source), index));
            }}
          >
            <Button
              type="button"
              draggable={!mutation.isPending}
              className="h-11"
              aria-label={`${t("order")} ${index + 1}`}
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", String(index));
                event.dataTransfer.effectAllowed = "move";
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  setRows((previous) => reorderStations(previous, index, index + (event.key === "ArrowUp" ? -1 : 1)));
                }
              }}
            >
              {t("order")} {index + 1}
            </Button>
            <StationFields
              station={station}
              onChange={(next) => setRows((previous) => previous.map((row, i) => (i === index ? next : row)))}
            />
          </fieldset>
        ))}
      </fieldset>
      <Button
        type="button"
        disabled={mutation.isPending}
        className="h-11 justify-self-start"
        onClick={() =>
          setRows((previous) => [
            ...previous,
            { name: "", status: "active", sortOrder: Math.max(-1, ...previous.map((station) => station.sortOrder)) + 1 },
          ])
        }
      >
        {t("add")}
      </Button>
      <Button type="submit" disabled={mutation.isPending} className="h-11 justify-self-start">
        {t("save")}
      </Button>
    </form>
  );
}
export function StationScreen() {
  const t = useTranslations("C-43");
  const query = useApiQuery("stations.list", { response: StationsListResponse });
  const stations = query.data ? [...query.data].sort((a, b) => a.sortOrder - b.sortOrder) : undefined;
  return (
    <section className="grid gap-6">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      {query.isPending ? (
        <p role="status">{t("loading")}</p>
      ) : query.isError ? (
        <p role="alert">{errorMessage(query.error)}</p>
      ) : stations ? (
        <StationEditor key={JSON.stringify(stations)} initialStations={stations} />
      ) : null}
    </section>
  );
}
