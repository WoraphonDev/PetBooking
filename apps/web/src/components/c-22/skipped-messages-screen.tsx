"use client";
import type { SkippedMessageItem } from "@app/contracts/dto/skipped-message-item";
import { LineSkippedQuery, LineSkippedResponse } from "@app/contracts/endpoints/line.skipped";
import { LineStatusResponse } from "@app/contracts/endpoints/line.status";
import Link from "next/link";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useState } from "react";
import type messages from "../../i18n/messages/th/C-22.json";
import { errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { useApiQuery } from "../../lib/query";
import { DataTable, type DataTableColumn } from "../shared/table";
import { Button } from "../ui/button";

export function SkippedMessagesScreen() {
  const t = useTranslations("C-22");
  const common = useTranslations("common");
  const now = useNow({ updateInterval: 60_000 });
  const format = useFormatter();
  const status = useApiQuery("line.status", { response: LineStatusResponse }, { meta: { toast: false } });
  const query = useApiQuery(
    "line.skipped",
    { query: LineSkippedQuery.parse({}), response: LineSkippedResponse },
    { meta: { toast: false } },
  );
  const [copying, setCopying] = useState<string | null>(null);
  const [copyError, setCopyError] = useState("");
  const [copied, setCopied] = useState(false);
  const quota = status.data;
  const percentage = quota && quota.monthlyPushQuota > 0 ? (quota.usedThisMonth / quota.monthlyPushQuota) * 100 : undefined;
  const columns: DataTableColumn<SkippedMessageItem>[] = [
    { id: "recipient", header: t("recipient"), cell: (row) => row.recipientName ?? "—" },
    {
      id: "subject",
      header: t("subject"),
      cell: (row) => {
        const key = `template_${row.templateKey.replaceAll(".", "_")}` as keyof typeof messages;
        return t.has(key) ? t(key) : t("unknownTemplate");
      },
    },
    { id: "reason", header: t("reason"), cell: (row) => (row.skipReason ? enumLabel("notification_skip_reason", row.skipReason) : "—") },
    {
      id: "text",
      header: t("text"),
      cell: (row) => (
        <div className="grid gap-2">
          <p className="max-w-lg whitespace-pre-wrap break-words rounded-md bg-muted p-3">{row.text}</p>
          <Button
            type="button"
            className="h-11"
            disabled={copying !== null}
            onClick={async () => {
              if (copying !== null) return;
              setCopying(row.id);
              setCopyError("");
              setCopied(false);
              try {
                await navigator.clipboard.writeText(row.text);
                setCopied(true);
                window.open("https://manager.line.biz/", "_blank", "noopener,noreferrer");
              } catch {
                setCopyError(t("copyFailed"));
              } finally {
                setCopying(null);
              }
            }}
          >
            {t("copy")}
          </Button>
        </div>
      ),
    },
    {
      id: "time",
      header: t("time"),
      cell: (row) => <time dateTime={row.createdAt}>{format.relativeTime(new Date(row.createdAt), now)}</time>,
    },
  ];
  return (
    <section className="grid gap-6">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <div className="grid gap-2 rounded-md border p-4">
        <h2>{t("quota")}</h2>
        <Link href="/console/settings/policy" className="inline-flex min-h-11 items-center underline">
          {t("economy")}
        </Link>
        {status.isError ? (
          <div role="alert">
            {errorMessage(status.error)} <Button onClick={() => status.refetch()}>{common("retry")}</Button>
          </div>
        ) : status.isPending ? (
          <div role="status" aria-busy="true" aria-label={common("loading")} className="h-8 animate-pulse bg-muted" />
        ) : quota ? (
          <>
            <p>
              {quota.usedThisMonth} / {quota.monthlyPushQuota}
            </p>
            <progress
              max={100}
              value={percentage === undefined ? undefined : Math.min(100, percentage)}
              aria-label={t("quota")}
              className={`w-full ${percentage !== undefined && percentage >= 90 ? "accent-red-600" : percentage !== undefined && percentage >= 70 ? "accent-orange-500" : "accent-primary"}`}
            />
          </>
        ) : null}
      </div>
      <div>{copyError ? <p role="alert">{copyError}</p> : copied ? <p role="status">{t("copied")}</p> : null}</div>
      <DataTable
        columns={columns}
        rows={query.data}
        rowKey={(row) => row.id}
        isLoading={query.isPending}
        error={query.isError ? errorMessage(query.error) : null}
        onRetry={() => query.refetch()}
      />
    </section>
  );
}
