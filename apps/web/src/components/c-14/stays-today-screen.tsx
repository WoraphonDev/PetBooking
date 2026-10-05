"use client";
import type { StayCard } from "@app/contracts/dto/stay-card";
import { StaysTodayResponse } from "@app/contracts/endpoints/stays.today";
import { toLocalDate } from "@app/domain/time/local-time";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTimeZone, useTranslations } from "next-intl";
import { errorMessage } from "../../lib/api";
import { useApiQuery } from "../../lib/query";
import { Button } from "../ui/button";

type Column = "arrivals" | "departures" | "in_house";
type T = ReturnType<typeof useTranslations<"C-14">>;
const DAY_MS = 86_400_000;

/** night x of y on `date` (x counted from the check-in night, kept within 1..nights) */
export function nightOf(stay: Pick<StayCard, "checkInDate" | "nights">, date: string): number {
  const x = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${stay.checkInDate}T00:00:00Z`)) / DAY_MS) + 1;
  return Math.min(Math.max(x, 1), stay.nights);
}
const mark = (ok: boolean, t: T, warn = false) => (
  <span className={ok ? "text-green-700" : warn ? "text-amber-700" : "text-destructive"}>
    {ok ? "✓" : warn ? "⚠" : "✗"} <span className="sr-only">{ok ? t("yes") : warn ? t("vaccineWarning") : t("no")}</span>
  </span>
);

/** one stay card for a column (06#scr-C-14) */
export function StayTile({ stay, column, date }: { stay: StayCard; column: Column; date: string }) {
  const t = useTranslations("C-14");
  const room = stay.roomCode ?? t("noRoom");
  return (
    <li className="grid gap-2 rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <strong>{stay.pet.name}</strong>
        <span>
          {t("room")} {room}
        </span>
      </div>
      {column === "arrivals" ? (
        <>
          <span>
            {t("arriveAt")} {stay.expectedCheckInTime ?? "—"}
          </span>
          <span className="flex flex-wrap gap-3">
            <span>
              {t("intake")} {mark(stay.intakeCompleted, t)}
            </span>
            <span>
              {t("agreement")} {mark(stay.agreementSigned, t)}
            </span>
            <span>
              {t("vaccines")} {mark(stay.vaccineGate.ok, t, true)}
            </span>
          </span>
        </>
      ) : null}
      {column === "departures" ? (
        // Q-0112: add-ons and the bundle bath status are not in StayCard yet
        <span>
          {t("pickUpAt")} {stay.expectedCheckOutTime ?? "—"}
        </span>
      ) : null}
      {column === "in_house" ? (
        // Q-0112: pending care tasks are not in StayCard yet
        <span>{t("night", { current: nightOf(stay, date), total: stay.nights })}</span>
      ) : null}
      {stay.status === "reserved" ? (
        <Button asChild className="h-11 justify-self-start">
          <Link href={`/console/stays/${stay.id}?step=intake`}>{t("checkIn")}</Link>
        </Button>
      ) : null}
      {stay.status === "checked_in" && column !== "arrivals" ? (
        <Button asChild variant="outline" className="h-11 justify-self-start">
          <Link href={`/console/stays/${stay.id}?step=checkout`}>{t("checkOut")}</Link>
        </Button>
      ) : null}
    </li>
  );
}

function StayColumn({ column, date }: { column: Column; date: string }) {
  const t = useTranslations("C-14");
  const list = useApiQuery("stays.today", { query: { date, type: column }, response: StaysTodayResponse });
  const title = column === "arrivals" ? t("arrivals") : column === "departures" ? t("departures") : t("inHouse");
  return (
    <section aria-label={title} className="grid content-start gap-3">
      <h2 className="text-lg font-semibold">
        {title}
        {list.data ? ` (${list.data.length})` : ""}
      </h2>
      {list.isPending ? (
        <p role="status">{t("loading")}</p>
      ) : list.isError ? (
        <p role="alert">{errorMessage(list.error)}</p>
      ) : list.data?.length ? (
        <ul className="grid gap-3">
          {list.data.map((stay) => (
            <StayTile key={stay.id} stay={stay} column={column} date={date} />
          ))}
        </ul>
      ) : (
        <p>{t("empty")}</p>
      )}
    </section>
  );
}

export function StaysTodayScreen() {
  const t = useTranslations("C-14");
  const timezone = useTimeZone() ?? "Asia/Bangkok";
  const params = useSearchParams();
  const asked = params.get("date");
  const date = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : toLocalDate({ instant: new Date().toISOString(), timezone });
  return (
    <section className="grid gap-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <div className="grid gap-4 lg:grid-cols-3">
        {(["arrivals", "departures", "in_house"] as const).map((column) => (
          <StayColumn key={column} column={column} date={date} />
        ))}
      </div>
    </section>
  );
}
