"use client";
// 06#scr-C-11 ext-M3 — น้องจากไป / ย้ายบ้าน (pets.setStatus): confirm with a sympathetic message; reminders stop.
import type { useTranslations } from "next-intl";
import { useState } from "react";
import { FormField } from "../shared/form";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Textarea } from "../ui/textarea";

type T = ReturnType<typeof useTranslations<"C-11">>;
export type LeaveStatus = "deceased" | "rehomed";

/** OF on an active pet (a pet that already left has nothing more to change here) */
export const canSetLeft = (role: string | undefined, status: string) => (role === "owner" || role === "front_desk") && status === "active";

const TITLE = { deceased: "passedAway", rehomed: "rehomed" } as const;
const BODY = { deceased: "passedAwayBody", rehomed: "rehomedBody" } as const;

export function StatusButtons({ t, onPick }: { t: T; onPick: (s: LeaveStatus) => void }) {
  return (
    <div className="ml-auto flex gap-2">
      {(["deceased", "rehomed"] as const).map((s) => (
        <Button key={s} type="button" variant="outline" className="h-11" onClick={() => onPick(s)}>
          {t(TITLE[s])}
        </Button>
      ))}
    </div>
  );
}

export function StatusDialog(props: {
  t: T;
  status: LeaveStatus | null;
  petName: string;
  busy: boolean;
  cancelLabel: string;
  onClose: () => void;
  onConfirm: (status: LeaveStatus, note: string) => Promise<void>;
}) {
  const { t, status } = props;
  const [note, setNote] = useState("");
  return (
    <Dialog open={status !== null} onOpenChange={(o) => (o ? null : props.onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{status ? t(TITLE[status]) : ""}</DialogTitle>
        </DialogHeader>
        {status ? <StatusMessage t={t} status={status} petName={props.petName} /> : null}
        <FormField id="c11-status-note" label={t("statusNote")}>
          <Textarea id="c11-status-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" onClick={props.onClose}>
            {props.cancelLabel}
          </Button>
          <Button
            type="button"
            className="h-11"
            disabled={props.busy}
            onClick={() =>
              status &&
              void props
                .onConfirm(status, note.trim())
                .then(() => setNote(""))
                .catch(() => {})
            }
          >
            {t("confirmStatus")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** ข้อความเห็นใจ + what happens next (reminders stop; future bookings stay — the shop moves them) */
export function StatusMessage({ t, status, petName }: { t: T; status: LeaveStatus; petName: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>{t(BODY[status], { name: petName })}</p>
      <p className="text-muted-foreground">{t("statusEffect")}</p>
    </div>
  );
}
