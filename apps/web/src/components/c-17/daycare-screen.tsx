"use client";
import type { DaycareVisitItem } from "@app/contracts/dto/daycare-visit-item";
import { DaycareCancelResponse } from "@app/contracts/endpoints/daycare.cancel";
import { DaycareCheckInResponse } from "@app/contracts/endpoints/daycare.check_in";
import { DaycareCheckOutResponse } from "@app/contracts/endpoints/daycare.check_out";
import { DaycareListResponse } from "@app/contracts/endpoints/daycare.list";
import { DaycareNoShowResponse } from "@app/contracts/endpoints/daycare.no_show";
import { toLocalDate } from "@app/domain/time/local-time";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTimeZone, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { formatTime } from "../../lib/format";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { FormField, ThaiDatePicker } from "../shared/form";
import { StatusBadge } from "../shared/table";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Skeleton } from "../ui/skeleton";
import { Textarea } from "../ui/textarea";

type T = ReturnType<typeof useTranslations<"C-17">>;
export type Action = "checkIn" | "checkOut" | "noShow" | "cancel";

/** 06 ปุ่ม/การกระทำ by daycare_visit.status */
export const actionsFor = (status: DaycareVisitItem["status"]): Action[] =>
  status === "reserved" ? ["checkIn", "noShow", "cancel"] : status === "checked_in" ? ["checkOut"] : [];

export const parseDate = (v: string | null, today: string) =>
  v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : today;

/** 06#scr-C-17 — the day's daycare visits: check in / out, no-show, cancel. */
export function DaycareScreen() {
  const t = useTranslations("C-17");
  const common = useTranslations("common");
  const timezone = useTimeZone() ?? "Asia/Bangkok";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const date = parseDate(params.get("date"), toLocalDate({ instant: new Date().toISOString(), timezone }));
  const list = useApiQuery("daycare.list", { query: { date }, response: DaycareListResponse });
  const invalidate = ["daycare.list", "calendar.day", "dashboard.today", "bookings.get"] as const;
  const checkIn = useApiMutation("daycare.check_in", { response: DaycareCheckInResponse, invalidate: [...invalidate] });
  const checkOut = useApiMutation("daycare.check_out", { response: DaycareCheckOutResponse, invalidate: [...invalidate] });
  const noShow = useApiMutation("daycare.no_show", { response: DaycareNoShowResponse, invalidate: [...invalidate] });
  const cancel = useApiMutation("daycare.cancel", { response: DaycareCancelResponse, invalidate: [...invalidate] });
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const busy = checkIn.isPending || checkOut.isPending || noShow.isPending || cancel.isPending;
  const done = () => toast.success(t("saved"));
  const run = (action: Action, visitId: string) => {
    const params = { visitId };
    if (action === "checkIn") void checkIn.mutateAsync({ params }).then(done);
    if (action === "checkOut") void checkOut.mutateAsync({ params }).then(done);
    if (action === "noShow") void noShow.mutateAsync({ params, body: {} }).then(done);
    if (action === "cancel") setCancelling(visitId);
  };
  return (
    <div data-screen="C-17" className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>
      <div className="flex flex-col gap-1 self-start">
        <span className="font-medium text-sm">{t("date")}</span>
        <ThaiDatePicker value={date} placeholder={t("date")} onValueChange={(d) => d && router.replace(`${pathname}?date=${d}`)} />
      </div>
      {list.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : list.isError ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert">{errorMessage(list.error)}</p>
          <Button type="button" onClick={() => void list.refetch()}>
            {common("retry")}
          </Button>
        </div>
      ) : (
        <VisitTable t={t} visits={list.data} timezone={timezone} busy={busy} onAction={run} />
      )}
      <Dialog open={cancelling !== null} onOpenChange={(o) => (o ? null : setCancelling(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("cancel")}</DialogTitle>
          </DialogHeader>
          <FormField id="c17-reason" label={t("cancelReason")}>
            <Textarea id="c17-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={() => setCancelling(null)}>
              {common("cancel")}
            </Button>
            <Button
              type="button"
              className="h-11"
              disabled={!reason.trim() || busy}
              onClick={() =>
                cancelling &&
                void cancel.mutateAsync({ params: { visitId: cancelling }, body: { reason: reason.trim() } }).then(() => {
                  setCancelling(null);
                  setReason("");
                  done();
                })
              }
            >
              {t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const LABEL = { checkIn: "checkIn", checkOut: "checkOut", noShow: "noShow", cancel: "cancel" } as const;

export function VisitTable(props: {
  t: T;
  visits: DaycareVisitItem[];
  timezone: string;
  busy: boolean;
  onAction: (a: Action, visitId: string) => void;
}) {
  const { t, timezone } = props;
  if (props.visits.length === 0) return <p className="text-muted-foreground">{t("empty")}</p>;
  const time = (instant: string | null) => (instant ? formatTime({ instant, timezone }) : t("none"));
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="py-2">{t("pet")}</th>
          <th className="py-2">{t("session")}</th>
          <th className="py-2">{t("status")}</th>
          <th className="py-2">{t("inOut")}</th>
          <th className="py-2">{t("vaccine")}</th>
          <th className="py-2" />
        </tr>
      </thead>
      <tbody>
        {props.visits.map((v) => (
          <tr key={v.id} className="border-t align-top">
            <td className="py-2">
              <span className="flex items-center gap-2">
                {v.pet.photoUrl ? (
                  // biome-ignore lint/performance/noImgElement: signed storage URL, not a Next static asset
                  <img src={v.pet.photoUrl} alt="" className="size-8 rounded-full object-cover" />
                ) : null}
                <span className="font-medium">{v.pet.name}</span>
              </span>
              <span className="mt-1 flex flex-wrap gap-1">
                {v.pet.flags.map((f) => (
                  <span key={f} className="rounded bg-destructive px-1 text-white text-xs">
                    {enumLabel("temperament_flag", f)}
                  </span>
                ))}
              </span>
            </td>
            <td className="py-2">{v.sessionName}</td>
            <td className="py-2">
              <StatusBadge enumName="daycare_status" value={v.status} />
            </td>
            <td className="py-2 tabular-nums">
              {time(v.checkedInAt)} / {time(v.checkedOutAt)}
            </td>
            <td className="py-2">
              {/* R-11 via PetSummary.vaccineStatus */}
              <span title={t(v.pet.vaccineStatus === "ok" ? "vaccineOk" : "vaccineWarn")}>{v.pet.vaccineStatus === "ok" ? "✓" : "⚠"}</span>
            </td>
            <td className="py-2 text-right">
              <span className="flex justify-end gap-1">
                {actionsFor(v.status).map((a) => (
                  <Button
                    key={a}
                    type="button"
                    size="sm"
                    variant={a === "cancel" || a === "noShow" ? "outline" : "default"}
                    disabled={props.busy}
                    onClick={() => props.onAction(a, v.id)}
                  >
                    {t(LABEL[a])}
                  </Button>
                ))}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
