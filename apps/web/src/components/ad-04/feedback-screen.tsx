"use client";

import type { FeedbackItem } from "@app/contracts/dto/feedback-item";
import { AdminFeedbackResponse } from "@app/contracts/endpoints/admin.feedback";
import { AdminUpdateFeedbackResponse } from "@app/contracts/endpoints/admin.updateFeedback";
import { type FeedbackStatus, feedbackStatusValues } from "@app/contracts/enums";
import { useTranslations } from "next-intl";
import { errorMessage } from "@/lib/api";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { DataTable, type DataTableColumn } from "../shared/table";

// Q-0043: enum-labels.th.json has no feedback_status yet — labels live in AD-04.json until it does
const STATUS_KEY = { new: "statusNew", acknowledged: "statusAcknowledged", done: "statusDone" } as const;

/** a shop-submitted page_url becomes a link only when it is http(s) */
const isWebUrl = (value: string) => /^https?:\/\//i.test(value);

export function FeedbackStatusSelect({ row }: { row: FeedbackItem }) {
  const t = useTranslations("AD-04");
  const update = useApiMutation<AdminUpdateFeedbackResponse>("admin.updateFeedback", {
    response: AdminUpdateFeedbackResponse,
    invalidate: ["admin.feedback"],
  });
  return (
    <select
      aria-label={t("changeStatus")}
      className="h-9 rounded-md border bg-background px-2 text-sm"
      value={row.status}
      disabled={update.isPending}
      onChange={(event) => update.mutate({ params: { feedbackId: row.id }, body: { status: event.target.value as FeedbackStatus } })}
    >
      {feedbackStatusValues.map((status) => (
        <option key={status} value={status}>
          {t(STATUS_KEY[status])}
        </option>
      ))}
    </select>
  );
}

export function FeedbackScreen() {
  const t = useTranslations("AD-04");
  const feedback = useApiQuery<AdminFeedbackResponse>("admin.feedback", { response: AdminFeedbackResponse }, { meta: { toast: false } });
  const columns: DataTableColumn<FeedbackItem>[] = [
    { id: "orgName", header: t("shop"), cell: (row) => row.orgName },
    { id: "staffName", header: t("staff"), cell: (row) => row.staffName },
    { id: "message", header: t("message"), cell: (row) => <span className="whitespace-pre-wrap">{row.message}</span> },
    {
      id: "pageUrl",
      header: t("page"),
      cell: (row) =>
        isWebUrl(row.pageUrl) ? (
          <a href={row.pageUrl} target="_blank" rel="noreferrer" className="break-all underline">
            {row.pageUrl}
          </a>
        ) : (
          <span className="break-all">{row.pageUrl}</span>
        ),
    },
    {
      id: "screenshot",
      header: t("screenshot"),
      cell: (row) =>
        row.screenshotUrl ? (
          <a href={row.screenshotUrl} target="_blank" rel="noreferrer">
            {/* biome-ignore lint/performance/noImgElement: signed storage URL, not a Next static asset */}
            <img src={row.screenshotUrl} alt={t("screenshot")} className="h-12 w-20 rounded object-cover" />
          </a>
        ) : (
          t("unavailable")
        ),
    },
    { id: "status", header: t("status"), cell: (row) => <FeedbackStatusSelect row={row} /> },
  ];
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <DataTable
        columns={columns}
        rows={feedback.data}
        rowKey={(row) => row.id}
        isLoading={feedback.isPending}
        error={feedback.error ? errorMessage(feedback.error) : null}
        onRetry={() => void feedback.refetch()}
      />
    </main>
  );
}
