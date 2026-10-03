"use client";
import type { AuditLogItem } from "@app/contracts/dto/audit-log-item";
import { AuditListRequest, AuditListResponse } from "@app/contracts/endpoints/audit.list";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTimeZone, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import messages from "../../i18n/messages/th/C-26.json";
import { errorMessage } from "../../lib/api";
import { formatThaiDate, formatTime } from "../../lib/format";
import { useApiQuery } from "../../lib/query";
import { ThaiDatePicker } from "../shared/form";
import { DataTable, type DataTableColumn, useCursorPagination } from "../shared/table";
import { Button } from "../ui/button";

/** message keys use `__` for the `.` of an action (next-intl keys cannot contain dots) */
const ACTIONS = Object.keys(messages.actions).map((key) => key.replace("__", "."));
/** entity types with a console page (06 routes); the rest show their name only */
const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  bill: (id) => `/console/bills/${id}`,
  booking: (id) => `/console/bookings/${id}`,
  customer: (id) => `/console/customers/${id}`,
  stay: (id) => `/console/stays/${id}`,
  pet: (id) => `/console/pets/${id}`,
};
const text = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** `key: before → after` for every field the entry changed (audit rows keep changed keys only, R-27) */
export function changeLines(row: Pick<AuditLogItem, "before" | "after">): string[] {
  const before = (row.before ?? {}) as Record<string, unknown>;
  const after = (row.after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys.map((key) => (key in before ? `${key}: ${text(before[key])} → ${text(after[key])}` : `${key}: ${text(after[key])}`));
}

export function AuditLogScreen() {
  const t = useTranslations("C-26");
  const timezone = useTimeZone() ?? "Asia/Bangkok";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const action = params.get("action") || undefined;
  const from = params.get("from") || undefined;
  const to = params.get("to") || undefined;
  const pagination = useCursorPagination();
  const reset = pagination.reset;
  const previousFilters = useRef({ action, from, to });
  useEffect(() => {
    const prev = previousFilters.current;
    if (prev.action !== action || prev.from !== from || prev.to !== to) {
      previousFilters.current = { action, from, to };
      reset();
    }
  }, [action, from, to, reset]);
  const filters = AuditListRequest.safeParse({ action, from, to, cursor: pagination.cursor ?? undefined });
  const query = useApiQuery(
    "audit.list",
    { query: filters.success ? filters.data : undefined, response: AuditListResponse },
    { enabled: filters.success },
  );
  const setFilter = (key: "action" | "from" | "to", value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(next.size ? `${pathname}?${next}` : pathname);
  };
  const actionLabel = (value: string) => messages.actions[value.replace(".", "__") as keyof typeof messages.actions] ?? value;

  const columns: DataTableColumn<AuditLogItem>[] = [
    {
      id: "time",
      header: t("time"),
      cell: (row) => {
        const date = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(row.at));
        return `${formatThaiDate({ date })} ${formatTime({ instant: row.at, timezone })}`;
      },
    },
    {
      id: "actor",
      header: t("actor"),
      cell: (row) => (
        <span>
          {row.actorName ?? messages.actors[row.actorType]}
          {row.viaSupport ? <span className="text-muted-foreground"> · {t("viaSupport")}</span> : null}
        </span>
      ),
    },
    { id: "action", header: t("action"), cell: (row) => actionLabel(row.action) },
    {
      id: "item",
      header: t("item"),
      cell: (row) => {
        const name = messages.entities[row.entityType as keyof typeof messages.entities] ?? row.entityType;
        const href = row.entityId ? ENTITY_ROUTES[row.entityType]?.(row.entityId) : undefined;
        return href ? (
          <Link href={href} className="inline-flex min-h-11 items-center underline">
            {name}
          </Link>
        ) : (
          name
        );
      },
    },
    { id: "reason", header: t("reason"), cell: (row) => row.reason ?? "—" },
    {
      id: "change",
      header: t("change"),
      cell: (row) => {
        const lines = changeLines(row);
        return lines.length ? (
          <ul className="grid gap-1 font-mono text-xs">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          "—"
        );
      },
    },
  ];

  return (
    <section className="grid gap-6">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto] sm:items-end">
        <label className="grid gap-2 text-sm font-medium">
          {t("action")}
          <select
            className="h-11 rounded-md border bg-background px-3"
            value={action ?? ""}
            onChange={(e) => setFilter("action", e.target.value || null)}
          >
            <option value="">{t("allActions")}</option>
            {ACTIONS.map((value) => (
              <option key={value} value={value}>
                {actionLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">{t("dateRange")}</legend>
          <div className="grid grid-cols-2 gap-2">
            <ThaiDatePicker value={from ?? null} max={to} placeholder={t("from")} onValueChange={(v) => setFilter("from", v)} />
            <ThaiDatePicker value={to ?? null} min={from} placeholder={t("to")} onValueChange={(v) => setFilter("to", v)} />
          </div>
        </fieldset>
        <Button type="button" variant="outline" className="h-11" onClick={() => router.replace(pathname)}>
          {t("clear")}
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={query.data?.items}
        rowKey={(row) => row.id}
        isLoading={query.isPending}
        error={!filters.success ? t("invalidFilter") : query.isError ? errorMessage(query.error) : null}
        onRetry={() => query.refetch()}
        pagination={{
          nextCursor: query.data?.nextCursor ?? null,
          hasPrevious: pagination.hasPrevious,
          onNext: pagination.next,
          onPrevious: pagination.previous,
        }}
      />
    </section>
  );
}
