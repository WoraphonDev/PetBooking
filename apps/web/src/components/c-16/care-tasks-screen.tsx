"use client";
import type { CareTaskItem } from "@app/contracts/dto/care-task-item";
import { CareTasksDoneResponse } from "@app/contracts/endpoints/careTasks.done";
import { CareTasksListResponse } from "@app/contracts/endpoints/careTasks.list";
import { CareTasksSkipRequest, CareTasksSkipResponse } from "@app/contracts/endpoints/careTasks.skip";
import { toLocalDate } from "@app/domain/time/local-time";
import { useSearchParams } from "next/navigation";
import { useTimeZone, useTranslations } from "next-intl";
import { useState } from "react";
import { errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { formatTime } from "../../lib/format";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { StatusBadge } from "../shared/table";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Textarea } from "../ui/textarea";

const OVERDUE_MS = 30 * 60_000;
const ICON = { feed: "🍚", medication: "💊", walk: "🐾", clean: "🧹", other: "📝" } as const;

/** 06#scr-C-16: pending and more than 30 minutes past due */
export const isOverdue = (task: Pick<CareTaskItem, "status" | "dueAt">, now: number) =>
  task.status === "pending" && now - Date.parse(task.dueAt) > OVERDUE_MS;

/** tasks grouped by their local due time (HH:mm), in due order */
export function groupByTime(tasks: CareTaskItem[], timezone: string): [string, CareTaskItem[]][] {
  const groups = new Map<string, CareTaskItem[]>();
  for (const t of [...tasks].sort((a, b) => a.dueAt.localeCompare(b.dueAt))) {
    const key = formatTime({ instant: t.dueAt, timezone });
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.entries()];
}

export function TaskRow({
  task,
  timezone,
  now,
  busy,
  onDone,
  onSkip,
}: {
  task: CareTaskItem;
  timezone: string;
  now: number;
  busy: boolean;
  onDone: (task: CareTaskItem) => void;
  onSkip: (task: CareTaskItem) => void;
}) {
  const t = useTranslations("C-16");
  const overdue = isOverdue(task, now);
  return (
    <tr className={overdue ? "bg-destructive/10" : undefined}>
      <td className="p-2 font-mono">{formatTime({ instant: task.dueAt, timezone })}</td>
      <td className="p-2">
        <span role="img" aria-label={enumLabel("care_task_type", task.taskType)}>
          {ICON[task.taskType]}
        </span>{" "}
        {task.title}
        {task.medication ? ` (${task.medication})` : ""}
      </td>
      <td className="p-2">
        {task.petName}
        {task.roomCode ? ` · ${task.roomCode}` : ""}
      </td>
      <td className="p-2">
        <span className="flex items-center gap-2">
          <input type="checkbox" readOnly checked={task.status === "done"} aria-label={enumLabel("care_task_status", task.status)} />
          <StatusBadge enumName="care_task_status" value={task.status} />
          {overdue ? <span className="text-destructive">{t("overdue")}</span> : null}
        </span>
      </td>
      <td className="p-2">{task.doneAt ? `${task.doneByName ?? ""} ${formatTime({ instant: task.doneAt, timezone })}`.trim() : "—"}</td>
      <td className="p-2">{task.note ?? ""}</td>
      <td className="p-2">
        {task.status === "pending" ? (
          <span className="flex gap-2">
            <Button type="button" className="h-11" disabled={busy} onClick={() => onDone(task)}>
              {t("done")}
            </Button>
            <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => onSkip(task)}>
              {t("skip")}
            </Button>
          </span>
        ) : null}
      </td>
    </tr>
  );
}

export function SkipDialog({
  task,
  pending,
  onCancel,
  onSubmit,
}: {
  task: CareTaskItem | null;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (note: string) => Promise<void>;
}) {
  const t = useTranslations("C-16");
  const common = useTranslations("common");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  return (
    <Dialog open={task !== null} onOpenChange={(open) => (open ? null : onCancel())}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending) return;
            const parsed = CareTasksSkipRequest.safeParse({ note });
            if (!parsed.success) {
              setError(t("skipInvalid"));
              return;
            }
            setError("");
            await onSubmit(parsed.data.note);
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("skipTitle", { title: task?.title ?? "" })}</DialogTitle>
          </DialogHeader>
          <label htmlFor="skip-note" className="text-sm font-medium">
            {t("skipReason")}
          </label>
          <Textarea id="skip-note" maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} />
          {error ? <p role="alert">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={onCancel}>
              {common("cancel")}
            </Button>
            <Button type="submit" className="h-11" disabled={pending}>
              {t("skip")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CareTasksScreen() {
  const t = useTranslations("C-16");
  const timezone = useTimeZone() ?? "Asia/Bangkok";
  const params = useSearchParams();
  const asked = params.get("date");
  const now = Date.now();
  const date = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : toLocalDate({ instant: new Date(now).toISOString(), timezone });
  const list = useApiQuery("careTasks.list", { query: { date }, response: CareTasksListResponse });
  const done = useApiMutation("careTasks.done", { response: CareTasksDoneResponse, invalidate: ["careTasks.list"] });
  const skip = useApiMutation("careTasks.skip", { response: CareTasksSkipResponse, invalidate: ["careTasks.list"] });
  const [skipping, setSkipping] = useState<CareTaskItem | null>(null);
  const [message, setMessage] = useState("");
  const busy = done.isPending || skip.isPending;
  const markDone = async (task: CareTaskItem) => {
    try {
      await done.mutateAsync({ params: { taskId: task.id }, body: {} });
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };
  return (
    <section className="grid gap-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      {message ? <p role="status">{message}</p> : null}
      {list.isPending ? (
        <p role="status">{t("loading")}</p>
      ) : list.isError ? (
        <p role="alert">{errorMessage(list.error)}</p>
      ) : !list.data?.length ? (
        <p>{t("empty")}</p>
      ) : (
        groupByTime(list.data, timezone).map(([time, tasks]) => (
          <section key={time} aria-label={time} className="grid gap-2">
            <h2 className="text-lg font-semibold">{time}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  {(["time", "task", "petRoom", "status", "doneBy", "note"] as const).map((key) => (
                    <th key={key} className="p-2 font-medium">
                      {t(key)}
                    </th>
                  ))}
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <TaskRow key={task.id} task={task} timezone={timezone} now={now} busy={busy} onDone={markDone} onSkip={setSkipping} />
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}
      <SkipDialog
        key={skipping?.id ?? "closed"}
        task={skipping}
        pending={skip.isPending}
        onCancel={() => setSkipping(null)}
        onSubmit={async (note) => {
          if (!skipping) return;
          try {
            await skip.mutateAsync({ params: { taskId: skipping.id }, body: { note } });
            setSkipping(null);
          } catch (error) {
            setMessage(errorMessage(error));
          }
        }}
      />
    </section>
  );
}
