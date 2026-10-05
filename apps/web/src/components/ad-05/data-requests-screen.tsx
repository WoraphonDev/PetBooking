"use client";

import type { DataRequestItem } from "@app/contracts/dto/data-request-item";
import { AdminDataRequestsResponse } from "@app/contracts/endpoints/admin.dataRequests";
import { AdminResolveDataRequestRequest, AdminResolveDataRequestResponse } from "@app/contracts/endpoints/admin.resolveDataRequest";
import { toLocalDate } from "@app/domain/time/local-time";
import { useNow, useTranslations } from "next-intl";
import { useState } from "react";
import { errorMessage } from "@/lib/api";
import { enumLabel } from "@/lib/enum-label";
import { formatThaiDate } from "@/lib/format";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { DataTable, type DataTableColumn } from "../shared/table";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Textarea } from "../ui/textarea";

const DAY_MS = 86_400_000;
const TIMEZONE = "Asia/Bangkok";
// Q-0117: enum-labels.th.json has no data_request_status yet — labels live in AD-05.json (as Q-0043)
const STATUS_KEY = { open: "statusOpen", done: "statusDone", rejected: "statusRejected" } as const;

/** PDPA answer window: 30 days from the request (negative = overdue) */
export function daysLeft(createdAt: string, now: number): number {
  return 30 - Math.floor((now - Date.parse(createdAt)) / DAY_MS);
}

export function ResolveDialog({
  request,
  pending,
  onCancel,
  onSubmit,
}: {
  request: DataRequestItem | null;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (body: AdminResolveDataRequestRequest) => Promise<void>;
}) {
  const t = useTranslations("AD-05");
  const [status, setStatus] = useState<"done" | "rejected">("done");
  const [note, setNote] = useState(request?.note ?? "");
  return (
    <Dialog open={request !== null} onOpenChange={(open) => (open ? null : onCancel())}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending) return;
            const parsed = AdminResolveDataRequestRequest.safeParse({ status, ...(note.trim() ? { note } : {}) });
            if (parsed.success) await onSubmit(parsed.data);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {t("resolveTitle")}: {request?.orgName} · {request ? enumLabel("data_request_type", request.type) : ""}
            </DialogTitle>
          </DialogHeader>
          <fieldset className="flex gap-4">
            {(["done", "rejected"] as const).map((value) => (
              <label key={value} className="flex h-11 items-center gap-2">
                <input type="radio" name="resolution" value={value} checked={status === value} onChange={() => setStatus(value)} />
                {value === "done" ? t("resultDone") : t("resultRejected")}
              </label>
            ))}
          </fieldset>
          <label htmlFor="data-request-note" className="text-sm font-medium">
            {t("note")}
          </label>
          <Textarea id="data-request-note" maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
          {request?.type === "delete" && status === "done" ? (
            <p role="alert" className="text-destructive">
              {t("deleteWarning")}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={onCancel}>
              {t("cancel")}
            </Button>
            <Button type="submit" className="h-11" disabled={pending}>
              {t("confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DataRequestsScreen() {
  const t = useTranslations("AD-05");
  const now = useNow({ updateInterval: 60_000 }).getTime();
  const requests = useApiQuery<AdminDataRequestsResponse>(
    "admin.dataRequests",
    { response: AdminDataRequestsResponse },
    { meta: { toast: false } },
  );
  const resolve = useApiMutation<AdminResolveDataRequestResponse>("admin.resolveDataRequest", {
    response: AdminResolveDataRequestResponse,
    invalidate: ["admin.dataRequests"],
  });
  const [resolving, setResolving] = useState<DataRequestItem | null>(null);
  const [message, setMessage] = useState("");
  const columns: DataTableColumn<DataRequestItem>[] = [
    { id: "orgName", header: t("shop"), cell: (row) => row.orgName },
    { id: "type", header: t("type"), cell: (row) => enumLabel("data_request_type", row.type) },
    { id: "status", header: t("status"), cell: (row) => t(STATUS_KEY[row.status]) },
    {
      id: "createdAt",
      header: t("requestedAt"),
      cell: (row) => {
        const left = daysLeft(row.createdAt, now);
        return (
          <span className="flex flex-col">
            {formatThaiDate({ date: toLocalDate({ instant: row.createdAt, timezone: TIMEZONE }) })}
            {row.status === "open" ? (
              <span className={left < 0 ? "text-destructive" : "text-muted-foreground"}>
                {left < 0 ? t("overdue", { days: -left }) : t("daysLeft", { days: left })}
              </span>
            ) : null}
          </span>
        );
      },
    },
    { id: "note", header: t("note"), cell: (row) => <span className="whitespace-pre-wrap">{row.note ?? ""}</span> },
    {
      id: "actions",
      header: "",
      cell: (row) =>
        row.status === "open" ? (
          <Button type="button" className="h-11" disabled={resolve.isPending} onClick={() => setResolving(row)}>
            {t("resolve")}
          </Button>
        ) : null,
    },
  ];
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {message ? <p role="status">{message}</p> : null}
      <DataTable
        columns={columns}
        rows={requests.data}
        rowKey={(row) => row.id}
        isLoading={requests.isPending}
        error={requests.error ? errorMessage(requests.error) : null}
        onRetry={() => void requests.refetch()}
        empty={{ message: t("empty") }}
      />
      <ResolveDialog
        key={resolving?.id ?? "closed"}
        request={resolving}
        pending={resolve.isPending}
        onCancel={() => setResolving(null)}
        onSubmit={async (body) => {
          if (!resolving) return;
          try {
            await resolve.mutateAsync({ params: { requestId: resolving.id }, body });
            setResolving(null);
          } catch (error) {
            setMessage(errorMessage(error));
          }
        }}
      />
    </main>
  );
}
