"use client";

import type { MyBookingItem } from "@app/contracts/dto/my-booking-item";
import { LiffBookingsResponse } from "@app/contracts/endpoints/liff.bookings";
import { LiffShopResponse } from "@app/contracts/endpoints/liff.shop";
import { toLocalDate } from "@app/domain/time/local-time";
import { CalendarDays, CircleUser, Hotel, Package, PawPrint, Scissors, Sun } from "lucide-react";
import Link from "next/link";
import { useNow, useTranslations } from "next-intl";
import { DEFAULT_TIME_ZONE } from "@/i18n/request";
import { errorMessage } from "@/lib/api";
import { enumLabel } from "@/lib/enum-label";
import { formatThaiDate, formatTime } from "@/lib/format";
import { useApiQuery } from "@/lib/query";
import { liffNavigation } from "../shell-liff/navigation";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

type ScreenId = (typeof liffNavigation)[number]["id"];

/** href of a LIFF screen for this branch (extra route ids filled in), or null until that screen is implemented */
export function screenHref(id: ScreenId, branchSlug: string, ids: Record<string, string> = {}): string | null {
  const entry = liffNavigation.find((e) => e.id === id);
  if (!entry?.implemented) return null;
  return entry.route.replace(/\[(\w+)\]/g, (_, name: string) => encodeURIComponent(name === "branchSlug" ? branchSlug : (ids[name] ?? "")));
}

/** 'HH:MM–HH:MM' for the branch-local weekday of `now`, or null when closed / no row (ShopPublic has no timezone: 06 default) */
export function todayHours(hours: LiffShopResponse["hours"], now: Date, timeZone = DEFAULT_TIME_ZONE): string | null {
  const date = toLocalDate({ instant: now.toISOString(), timezone: timeZone });
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const h = hours.find((x) => x.weekday === weekday);
  return h && !h.isClosed && h.opensAt && h.closesAt ? `${h.opensAt}–${h.closesAt}` : null;
}

/** the soonest upcoming booking (liff.bookings upcoming is soonest first) */
export const nextBooking = (bookings: MyBookingItem[]): MyBookingItem | null => bookings[0] ?? null;

function MenuLink({ href, icon, label }: { href: string | null; icon: React.ReactNode; label: string }) {
  const body = (
    <>
      {icon}
      <span className="text-sm">{label}</span>
    </>
  );
  const cls = "flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg border p-3 text-center";
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" disabled className={`${cls} opacity-50`}>
      {body}
    </button>
  );
}

export function NextBookingCard({ booking, branchSlug }: { booking: MyBookingItem; branchSlug: string }) {
  const t = useTranslations("L-02");
  const at = booking.firstServiceAt;
  const pay = booking.depositStatus === "pending" || booking.depositStatus === "rejected";
  const payHref = screenHref("L-07", branchSlug, { bookingId: booking.id });
  return (
    <article className="grid gap-2 rounded-lg border p-4">
      {at ? (
        <p className="font-semibold">
          {formatThaiDate({ date: toLocalDate({ instant: at, timezone: DEFAULT_TIME_ZONE }), withWeekday: true })}{" "}
          {formatTime({ instant: at, timezone: DEFAULT_TIME_ZONE })}
        </p>
      ) : null}
      <p>{booking.petNames.join(", ")}</p>
      <p className="text-sm text-muted-foreground">{enumLabel("booking_status", booking.status)}</p>
      {pay ? (
        payHref ? (
          <Button asChild className="h-11">
            <Link href={payHref}>{t("payDeposit")}</Link>
          </Button>
        ) : (
          <Button type="button" className="h-11" disabled>
            {t("payDeposit")}
          </Button>
        )
      ) : null}
    </article>
  );
}

export function HomeScreen({ branchSlug }: { branchSlug: string }) {
  const t = useTranslations("L-02");
  const now = useNow();
  const shop = useApiQuery("liff.shop", { params: { branchSlug }, response: LiffShopResponse });
  const bookings = useApiQuery("liff.bookings", { params: { branchSlug }, query: { scope: "upcoming" }, response: LiffBookingsResponse });
  if (shop.isPending || bookings.isPending)
    return (
      <div className="grid gap-3 p-4" aria-busy="true">
        <span className="sr-only">{t("loading")}</span>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  if (shop.isError || bookings.isError)
    return (
      <div role="alert" className="grid justify-items-start gap-2 p-4">
        <p>{errorMessage(shop.error ?? bookings.error)}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            shop.refetch();
            bookings.refetch();
          }}
        >
          {t("retry")}
        </Button>
      </div>
    );
  const hours = todayHours(shop.data.hours, now);
  const next = nextBooking(bookings.data);
  const m = shop.data.modules;
  return (
    <div className="grid gap-6 p-4">
      <header className="grid gap-1">
        <h1 className="text-xl font-semibold">
          <span className="sr-only">{t("shopName")}: </span>
          {shop.data.name}
        </h1>
        <p className="text-sm">
          <span className="sr-only">{t("todayHours")}: </span>
          {hours ? t("openToday", { hours }) : t("closedToday")}
        </p>
      </header>

      <section className="grid gap-2">
        <h2 className="font-semibold">{t("nextBooking")}</h2>
        {next ? <NextBookingCard booking={next} branchSlug={branchSlug} /> : <p className="text-muted-foreground">{t("noBooking")}</p>}
      </section>

      <section className="grid gap-2">
        <h2 className="font-semibold">{t("menu")}</h2>
        <div className="grid grid-cols-3 gap-2">
          {m.grooming ? <MenuLink href={screenHref("L-04", branchSlug)} icon={<Scissors aria-hidden />} label={t("bookGrooming")} /> : null}
          {m.hotel ? <MenuLink href={screenHref("L-05", branchSlug)} icon={<Hotel aria-hidden />} label={t("bookHotel")} /> : null}
          {m.daycare ? <MenuLink href={screenHref("L-06", branchSlug)} icon={<Sun aria-hidden />} label={t("bookDaycare")} /> : null}
        </div>
        <div className="grid grid-cols-4 gap-2">
          <MenuLink href={screenHref("L-08", branchSlug)} icon={<CalendarDays aria-hidden />} label={t("myBookings")} />
          <MenuLink href={screenHref("L-03", branchSlug)} icon={<PawPrint aria-hidden />} label={t("myPets")} />
          <MenuLink href={screenHref("L-12", branchSlug)} icon={<Package aria-hidden />} label={t("packages")} />
          <MenuLink href={screenHref("L-15", branchSlug)} icon={<CircleUser aria-hidden />} label={t("profile")} />
        </div>
      </section>
    </div>
  );
}
