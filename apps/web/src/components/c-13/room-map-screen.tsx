"use client";
import { AuthMeResponse } from "@app/contracts/endpoints/auth.me";
import { RoomMapGetResponse } from "@app/contracts/endpoints/roomMap.get";
import { RoomUnitsHousekeepingResponse } from "@app/contracts/endpoints/roomUnits.housekeeping";
import { StaysChangeRoomResponse } from "@app/contracts/endpoints/stays.changeRoom";
import { toLocalDate } from "@app/domain/time/local-time";
import { cn } from "cn";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTimeZone, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ApiClientError, errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { formatThaiDate } from "../../lib/format";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { ThaiDatePicker } from "../shared/form";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { canDrop, groups, nextHousekeeping, parseDate, type Unit, zonesOf } from "./logic";

type T = ReturnType<typeof useTranslations<"C-13">>;

/** 06#scr-C-13 — rooms on one day: drag a pet to another room (OF), toggle housekeeping, open the stay. */
export function RoomMapScreen() {
  const t = useTranslations("C-13");
  const common = useTranslations("common");
  const timezone = useTimeZone() ?? "Asia/Bangkok";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const today = toLocalDate({ instant: new Date().toISOString(), timezone });
  const date = parseDate(params.get("date"), today);
  const [zone, setZone] = useState<string | null | undefined>(undefined);
  const me = useApiQuery("auth.me", { response: AuthMeResponse });
  const map = useApiQuery("roomMap.get", { query: { date }, response: RoomMapGetResponse });
  const invalidate = ["roomMap.get", "calendar.day", "bookings.get"] as const;
  const move = useApiMutation("stays.changeRoom", {
    response: StaysChangeRoomResponse,
    invalidate: [...invalidate],
    meta: { toast: false },
  });
  const clean = useApiMutation("roomUnits.housekeeping", { response: RoomUnitsHousekeepingResponse, invalidate: ["roomMap.get"] });
  const canMove = me.data?.staff.role === "owner" || me.data?.staff.role === "front_desk";

  if (map.isPending) return <Skeleton className="m-6 h-96" />;
  if (map.isError)
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p role="alert">{errorMessage(map.error)}</p>
        <Button type="button" onClick={() => void map.refetch()}>
          {common("retry")}
        </Button>
      </div>
    );
  return (
    <div data-screen="C-13" className="flex flex-col gap-4 p-6">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-medium text-sm">{t("date")}</span>
          <ThaiDatePicker value={date} placeholder={t("date")} onValueChange={(d) => d && router.replace(`${pathname}?date=${d}`)} />
        </div>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-sm">{t("zone")}</span>
          <select
            className="h-11 rounded-lg border border-input bg-transparent px-3 text-sm"
            value={zone === undefined ? "__all" : (zone ?? "__none")}
            onChange={(e) => setZone(e.target.value === "__all" ? undefined : e.target.value === "__none" ? null : e.target.value)}
          >
            <option value="__all">{t("allZones")}</option>
            {zonesOf(map.data.units).map((z) => (
              <option key={z ?? "__none"} value={z ?? "__none"}>
                {z ?? t("noZone")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <RoomGrid
        t={t}
        units={map.data.units}
        zone={zone}
        canMove={canMove}
        busy={move.isPending || clean.isPending}
        onMove={async (stayId, roomUnitId) => {
          try {
            await move.mutateAsync({ params: { stayId }, body: { roomUnitId } });
            toast.success(t("moved"));
          } catch (err) {
            // ROOM_TAKEN → the pet stays where it was (nothing moved locally) + toast
            toast.error(err instanceof ApiClientError ? err.message : errorMessage(err));
          }
        }}
        onHousekeeping={async (u) => {
          await clean.mutateAsync({ params: { roomUnitId: u.id }, body: { housekeeping: nextHousekeeping(u) } });
          toast.success(t("saved"));
        }}
      />
    </div>
  );
}

export function RoomGrid(props: {
  t: T;
  units: Unit[];
  zone: string | null | undefined;
  canMove: boolean;
  busy: boolean;
  onMove: (stayId: string, roomUnitId: string) => void;
  onHousekeeping: (u: Unit) => void;
}) {
  const { t } = props;
  const [dragging, setDragging] = useState<{ stayId: string; from: string } | null>(null);
  if (props.units.length === 0) return <p className="text-muted-foreground">{t("noRooms")}</p>;
  return (
    <div className="flex flex-col gap-6">
      {groups(props.units, props.zone).map((g) => (
        <section key={g.zone ?? "__none"} className="flex flex-col gap-2">
          <h2 className="font-medium">{g.zone ?? t("noZone")}</h2>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            {g.units.map((u) => {
              const s = u.occupant;
              return (
                <li
                  key={u.id}
                  data-unit={u.id}
                  className={cn(
                    "flex min-h-36 flex-col gap-1 rounded-xl border p-3 text-sm",
                    u.status !== "active" && "bg-muted text-muted-foreground",
                    dragging && canDrop(u, dragging.from) && "ring-2 ring-primary",
                  )}
                  onDragOver={(e) => {
                    if (dragging && canDrop(u, dragging.from)) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragging && canDrop(u, dragging.from)) props.onMove(dragging.stayId, u.id);
                    setDragging(null);
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-xl">
                      <span className="sr-only">{t("code")} </span>
                      {u.code}
                    </span>
                    <button
                      type="button"
                      className="text-lg"
                      disabled={props.busy}
                      title={t(u.housekeeping === "dirty" ? "markClean" : "markDirty")}
                      aria-label={`${t("housekeeping")}: ${enumLabel("housekeeping_status", u.housekeeping)}`}
                      onClick={() => props.onHousekeeping(u)}
                    >
                      {u.housekeeping === "dirty" ? "🧹" : "✨"}
                    </button>
                  </div>
                  <span className="text-muted-foreground text-xs">{u.roomTypeName}</span>
                  {u.status !== "active" ? <span className="text-xs">{enumLabel("room_unit_status", u.status)}</span> : null}
                  {s ? (
                    <Link
                      href={`/console/stays/${s.id}`}
                      draggable={props.canMove}
                      onDragStart={() => setDragging({ stayId: s.id, from: u.id })}
                      onDragEnd={() => setDragging(null)}
                      className={cn("mt-1 flex flex-col gap-1 rounded-lg bg-background p-2", props.canMove && "cursor-grab")}
                    >
                      <span className="flex items-center gap-2 font-medium">
                        {s.pet.photoUrl ? (
                          // biome-ignore lint/performance/noImgElement: signed storage URL, not a Next static asset
                          <img src={s.pet.photoUrl} alt="" className="size-6 rounded-full object-cover" />
                        ) : null}
                        {s.pet.name}
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {s.pet.flags.map((f) => (
                          <span key={f} className="rounded bg-destructive px-1 text-white text-xs">
                            {enumLabel("temperament_flag", f)}
                          </span>
                        ))}
                      </span>
                      <span className={cn("text-xs", u.departingToday && "font-medium text-orange-600")}>
                        {t("checkOut")} {formatThaiDate({ date: s.checkOutDate })}
                        {u.departingToday ? ` · ${t("leavingToday")}` : ""}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-muted-foreground text-xs">{t("vacant")}</span>
                  )}
                  {u.arrivingToday ? (
                    <span className="self-start rounded bg-emerald-100 px-1.5 text-emerald-800 text-xs">{t("arrivingToday")}</span>
                  ) : null}
                  {u.nextArrivalDate ? (
                    <span className="mt-auto text-muted-foreground text-xs">
                      {t("nextArrival")} {formatThaiDate({ date: u.nextArrivalDate })}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
