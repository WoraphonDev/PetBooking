"use client";

import type { MyBookingItem } from "@app/contracts/dto/my-booking-item";
import { LiffBookingsResponse } from "@app/contracts/endpoints/liff.bookings";
import { toLocalDate } from "@app/domain/time/local-time";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { DEFAULT_TIME_ZONE } from "@/i18n/request";
import { errorMessage } from "@/lib/api";
import { enumLabel } from "@/lib/enum-label";
import { formatThaiDate, formatTime } from "@/lib/format";
import { useApiQuery } from "@/lib/query";
import { liffNavigation } from "../shell-liff/navigation";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";

type Scope = "upcoming" | "past";

/** href of a LIFF screen with its route ids, or null until that screen is implemented (Q-1038) */
export function screenHref(id: "L-07" | "L-09", branchSlug: string, bookingId: string): string | null {
  const entry = liffNavigation.find((e) => e.id === id);
  if (!entry?.implemented) return null;
  return entry.route.replace("[branchSlug]", encodeURIComponent(branchSlug)).replace("[bookingId]", encodeURIComponent(bookingId));
}

/** deposit still to pay (same statuses liff.booking offers a PaymentInstruction for) */
export const depositDue = (b: MyBookingItem) => b.depositStatus === "pending" || b.depositStatus === "rejected";

export function BookingCard({ booking, branchSlug }: { booking: MyBookingItem; branchSlug: string }) {
  const t = useTranslations("L-08");
  const at = booking.firstServiceAt;
  const detail = screenHref("L-09", branchSlug, booking.id);
  const pay = screenHref("L-07", branchSlug, booking.id);
  const body = (
    <dl className="grid gap-1">
      <dt className="sr-only">{t("dateTime")}</dt>
      <dd className="font-semibold">
        {at
          ? `${formatThaiDate({ date: toLocalDate({ instant: at, timezone: DEFAULT_TIME_ZONE }), withWeekday: true })} ${formatTime({ instant: at, timezone: DEFAULT_TIME_ZONE })}`
          : "–"}
      </dd>
      <dt className="sr-only">{t("pets")}</dt>
      <dd className="flex flex-wrap gap-1">
        {booking.petNames.map((name) => (
          <Badge key={name} variant="secondary">
            {name}
          </Badge>
        ))}
      </dd>
      <dt className="sr-only">{t("services")}</dt>
      <dd>{booking.summary}</dd>
      <dt className="sr-only">{t("status")}</dt>
      <dd>
        <Badge>{enumLabel("booking_status", booking.status)}</Badge>
      </dd>
      <dt className="sr-only">{t("deposit")}</dt>
      <dd className="text-sm">{enumLabel("deposit_status", booking.depositStatus)}</dd>
      <dt className="sr-only">{t("bookingNo")}</dt>
      <dd className="text-xs text-muted-foreground">{booking.bookingNo}</dd>
    </dl>
  );
  return (
    <li className="grid gap-3 rounded-lg border p-4">
      {detail ? (
        <Link href={detail} className="block">
          {body}
        </Link>
      ) : (
        body
      )}
      {depositDue(booking) ? (
        pay ? (
          <Button asChild className="h-11">
            <Link href={pay}>{t("payDeposit")}</Link>
          </Button>
        ) : (
          <Button type="button" className="h-11" disabled>
            {t("payDeposit")}
          </Button>
        )
      ) : null}
    </li>
  );
}

export function BookingsScreen({ branchSlug }: { branchSlug: string }) {
  const t = useTranslations("L-08");
  const [scope, setScope] = useState<Scope>("upcoming");
  const bookings = useApiQuery("liff.bookings", { params: { branchSlug }, query: { scope }, response: LiffBookingsResponse });
  return (
    <div className="grid gap-4 p-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upcoming">{t("upcoming")}</TabsTrigger>
          <TabsTrigger value="past">{t("past")}</TabsTrigger>
        </TabsList>
      </Tabs>
      {bookings.isPending ? (
        <div className="grid gap-3" aria-busy="true">
          <span className="sr-only">{t("loading")}</span>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : bookings.isError ? (
        <div role="alert" className="grid justify-items-start gap-2">
          <p>{errorMessage(bookings.error)}</p>
          <Button type="button" variant="outline" onClick={() => bookings.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : bookings.data.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3">
          {bookings.data.map((b) => (
            <BookingCard key={b.id} booking={b} branchSlug={branchSlug} />
          ))}
        </ul>
      )}
    </div>
  );
}
