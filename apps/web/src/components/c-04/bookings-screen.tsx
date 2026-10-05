"use client";
import type { BookingListItem } from "@app/contracts/dto/booking-list-item";
import { BookingsApproveResponse } from "@app/contracts/endpoints/bookings.approve";
import { BookingsDeclineRequest, BookingsDeclineResponse } from "@app/contracts/endpoints/bookings.decline";
import { BookingsListResponse } from "@app/contracts/endpoints/bookings.list";
import type { BookingStatus } from "@app/contracts/enums";
import { toLocalDate } from "@app/domain/time/local-time";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTimeZone, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { formatTHB, formatThaiDate, formatTime } from "../../lib/format";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { EnumSelect, ThaiDatePicker } from "../shared/form";
import { DataTable, type DataTableColumn, StatusBadge, useCursorPagination } from "../shared/table";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Textarea } from "../ui/textarea";

export const TABS = ["approval", "deposit", "upcoming", "all"] as const;
export type Tab = (typeof TABS)[number];
const TAB_LABEL = { approval: "tabApproval", deposit: "tabDeposit", upcoming: "tabUpcoming", all: "tabAll" } as const;
const MODULE_ICON = { grooming: "✂️", hotel: "🏨", daycare: "🌞" } as const;

type ListQuery = { status?: BookingStatus; from?: string; to?: string; limit?: number; cursor?: string };
/**
 * 06#scr-C-04 tab → bookings.list queries. api.ts sends one value per query key, so the deposit tab asks once per status
 * and merges (Q-0109); every other tab is one query.
 */
export function tabQueries(
  tab: Tab,
  today: string,
  filters: { status?: BookingStatus | null; from?: string | null; to?: string | null } = {},
): ListQuery[] {
  if (tab === "approval") return [{ status: "awaiting_approval" }];
  if (tab === "deposit")
    return [
      { status: "awaiting_deposit", limit: 200 },
      { status: "deposit_review", limit: 200 },
    ];
  if (tab === "upcoming") return [{ status: "confirmed", from: today }];
  return [
    {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.from ? { from: filters.from } : {}),
      ...(filters.to ? { to: filters.to } : {}),
    },
  ];
}
/** remaining time as m:ss (h:mm:ss from an hour); null once passed */
export function countdown(until: string, now: number): string | null {
  const ms = Date.parse(until) - now;
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const [h, m, sec] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

type T = ReturnType<typeof useTranslations<"C-04">>;
export function bookingColumns(
  t: T,
  timezone: string,
  now: number,
  actions: { approve: (row: BookingListItem) => void; decline: (row: BookingListItem) => void; busy: boolean },
): DataTableColumn<BookingListItem>[] {
  return [
    {
      id: "bookingNo",
      header: t("bookingNo"),
      cell: (row) => (
        <Link href={`/console/bookings/${row.id}`} className="font-mono underline-offset-4 hover:underline">
          {row.bookingNo}
        </Link>
      ),
    },
    // Q-0109: BookingListItem has no reliability level yet
    { id: "customer", header: t("customer"), cell: (row) => row.customerName },
    {
      id: "pets",
      header: t("pets"),
      cell: (row) => (
        <span className="flex flex-wrap gap-1">
          {row.petNames.map((name) => (
            <span key={name} className="rounded-full bg-muted px-2 py-0.5 text-xs">
              {name}
            </span>
          ))}
        </span>
      ),
    },
    {
      id: "modules",
      header: t("services"),
      cell: (row) => (
        <span className="flex gap-1">
          {row.modules.map((m) => (
            <span key={m} role="img" aria-label={enumLabel("service_scope", m)} title={enumLabel("service_scope", m)}>
              {MODULE_ICON[m]}
            </span>
          ))}
        </span>
      ),
    },
    {
      id: "firstServiceAt",
      header: t("firstServiceAt"),
      cell: (row) =>
        row.firstServiceAt
          ? `${formatThaiDate({ date: toLocalDate({ instant: row.firstServiceAt, timezone }) })} ${formatTime({ instant: row.firstServiceAt, timezone })}`
          : "—",
    },
    { id: "total", header: t("total"), cell: (row) => formatTHB({ satang: row.estimatedTotalSatang }) },
    {
      id: "deposit",
      header: t("deposit"),
      cell: (row) => (
        <span className="flex items-center gap-2">
          <StatusBadge enumName="deposit_status" value={row.depositStatus} />
          {row.depositRequiredSatang > 0 ? formatTHB({ satang: row.depositRequiredSatang }) : null}
        </span>
      ),
    },
    {
      id: "holdExpires",
      header: t("holdExpires"),
      cell: (row) =>
        row.status === "awaiting_deposit" && row.holdExpiresAt ? (
          <span className="font-mono">{countdown(row.holdExpiresAt, now) ?? t("overdue")}</span>
        ) : null,
    },
    {
      id: "approvalDue",
      header: t("approvalDue"),
      cell: (row) => {
        if (!row.approvalDueAt) return null;
        const left = countdown(row.approvalDueAt, now);
        return left ? <span className="font-mono">{left}</span> : <span className="font-mono text-destructive">{t("overdue")}</span>;
      },
    },
    { id: "channel", header: t("channel"), cell: (row) => enumLabel("booking_channel", row.channel) },
    {
      id: "actions",
      header: t("actions"),
      cell: (row) =>
        row.status === "awaiting_approval" ? (
          <span className="flex gap-2">
            <Button type="button" className="h-11" disabled={actions.busy} onClick={() => actions.approve(row)}>
              {t("approve")}
            </Button>
            <Button type="button" variant="outline" className="h-11" disabled={actions.busy} onClick={() => actions.decline(row)}>
              {t("decline")}
            </Button>
          </span>
        ) : null,
    },
  ];
}

export function DeclineDialog({
  booking,
  pending,
  onCancel,
  onSubmit,
}: {
  booking: BookingListItem | null;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const t = useTranslations("C-04");
  const common = useTranslations("common");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  return (
    <Dialog open={booking !== null} onOpenChange={(open) => (open ? null : onCancel())}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending) return;
            const parsed = BookingsDeclineRequest.safeParse({ reason });
            if (!parsed.success) {
              setError(t("declineInvalid"));
              return;
            }
            setError("");
            await onSubmit(parsed.data.reason);
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("declineTitle", { bookingNo: booking?.bookingNo ?? "" })}</DialogTitle>
          </DialogHeader>
          <label htmlFor="decline-reason" className="text-sm font-medium">
            {t("declineReason")}
          </label>
          <Textarea id="decline-reason" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
          {error ? <p role="alert">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={onCancel}>
              {common("cancel")}
            </Button>
            <Button type="submit" className="h-11" disabled={pending}>
              {t("decline")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BookingsScreen() {
  const t = useTranslations("C-04");
  const timezone = useTimeZone() ?? "Asia/Bangkok";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const now = useNow();
  const tab: Tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "approval";
  const filters = {
    status: (params.get("status") as BookingStatus | null) || null,
    from: params.get("from") || null,
    to: params.get("to") || null,
  };
  const page = useCursorPagination();
  const today = toLocalDate({ instant: new Date(now).toISOString(), timezone });
  const [first, second] = tabQueries(tab, today, filters);
  const list = useApiQuery("bookings.list", {
    query: { ...first, ...(page.cursor && !second ? { cursor: page.cursor } : {}) },
    response: BookingsListResponse,
  });
  const other = useApiQuery("bookings.list", { query: second ?? {}, response: BookingsListResponse }, { enabled: second !== undefined });
  const rows =
    list.data && (!second || other.data)
      ? [...list.data.items, ...(second ? (other.data?.items ?? []) : [])].sort((a, b) =>
          (a.firstServiceAt ?? "").localeCompare(b.firstServiceAt ?? ""),
        )
      : undefined;
  // tab count of bookings awaiting approval (05 §0 max page)
  const waiting = useApiQuery("bookings.list", { query: { status: "awaiting_approval", limit: 200 }, response: BookingsListResponse });
  const approve = useApiMutation("bookings.approve", { response: BookingsApproveResponse, invalidate: ["bookings.list"] });
  const decline = useApiMutation("bookings.decline", { response: BookingsDeclineResponse, invalidate: ["bookings.list"] });
  const [declining, setDeclining] = useState<BookingListItem | null>(null);
  const [message, setMessage] = useState("");

  const setParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) value ? next.set(key, value) : next.delete(key);
    page.reset();
    router.replace(next.size ? `${pathname}?${next}` : pathname);
  };
  const waitingCount = waiting.data ? `${waiting.data.items.length}${waiting.data.nextCursor ? "+" : ""}` : "";
  const columns = bookingColumns(t, timezone, now, {
    busy: approve.isPending || decline.isPending,
    approve: async (row) => {
      try {
        await approve.mutateAsync({ params: { bookingId: row.id } });
        setMessage(t("approved", { bookingNo: row.bookingNo }));
      } catch (error) {
        setMessage(errorMessage(error));
      }
    },
    decline: (row) => setDeclining(row),
  });

  return (
    <section className="grid gap-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <div role="tablist" className="flex flex-wrap gap-2">
        {TABS.map((key) => (
          <Button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            variant={tab === key ? "default" : "outline"}
            className="h-11"
            onClick={() => setParam({ tab: key, status: null, from: null, to: null })}
          >
            {t(TAB_LABEL[key])}
            {key === "approval" && waitingCount ? ` (${waitingCount})` : null}
          </Button>
        ))}
      </div>
      {message ? <p role="status">{message}</p> : null}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        isLoading={list.isPending || (second !== undefined && other.isPending)}
        error={list.isError || (second && other.isError) ? errorMessage(list.error ?? other.error) : null}
        onRetry={() => {
          list.refetch();
          if (second) other.refetch();
        }}
        empty={{ message: t("empty") }}
        filters={
          tab === "all" ? (
            <>
              <label htmlFor="booking-status-filter" className="flex items-center gap-2">
                {t("statusFilter")}
                <EnumSelect
                  id="booking-status-filter"
                  enumName="booking_status"
                  value={filters.status}
                  placeholder={t("anyStatus")}
                  onValueChange={(value) => setParam({ status: value })}
                />
              </label>
              <span className="flex items-center gap-2">
                {t("from")}
                <ThaiDatePicker placeholder={t("from")} value={filters.from} onValueChange={(value) => setParam({ from: value })} />
              </span>
              <span className="flex items-center gap-2">
                {t("to")}
                <ThaiDatePicker placeholder={t("to")} value={filters.to} onValueChange={(value) => setParam({ to: value })} />
              </span>
            </>
          ) : null
        }
        pagination={{
          nextCursor: second ? null : (list.data?.nextCursor ?? null),
          hasPrevious: page.hasPrevious,
          onNext: page.next,
          onPrevious: page.previous,
        }}
      />
      <DeclineDialog
        key={declining?.id ?? "closed"}
        booking={declining}
        pending={decline.isPending}
        onCancel={() => setDeclining(null)}
        onSubmit={async (reason) => {
          if (!declining) return;
          try {
            await decline.mutateAsync({ params: { bookingId: declining.id }, body: { reason } });
            setMessage(t("declined", { bookingNo: declining.bookingNo }));
            setDeclining(null);
          } catch (error) {
            setMessage(errorMessage(error));
          }
        }}
      />
    </section>
  );
}
