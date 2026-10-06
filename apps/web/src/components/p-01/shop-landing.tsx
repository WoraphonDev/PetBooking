// P-01 หน้าลิงก์จองของร้าน: public page from the shop's QR poster — sends the visitor to book in LINE (06#scr-P-01).
import type { PublicBranchResponse as ShopPublic } from "@app/contracts/endpoints/public.branch";
import { useTranslations } from "next-intl";
import { formatTHB } from "@/lib/format";

/** Monday first, as Thai shop hours are usually read */
const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;

/** 'จ. 09:00–18:00' / 'ปิด' rows for all 7 days; a day without branch_hours counts as closed */
export function hoursRows(hours: ShopPublic["hours"]): { weekday: number; open: string | null }[] {
  return WEEK.map((weekday) => {
    const h = hours.find((x) => x.weekday === weekday);
    return { weekday, open: h && !h.isClosed && h.opensAt && h.closesAt ? `${h.opensAt}–${h.closesAt}` : null };
  });
}

/** Google Maps link: the coordinates when set, else a search for the address */
export function mapUrl(shop: Pick<ShopPublic, "latitude" | "longitude" | "address">): string | null {
  if (shop.latitude !== null && shop.longitude !== null)
    return `https://www.google.com/maps/search/?api=1&query=${shop.latitude},${shop.longitude}`;
  return shop.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.address)}` : null;
}

/** min(room_rate.nightly_price_satang) of a room type, null without rates */
export function nightlyFrom(rates: { nightlyPriceSatang: number }[]): number | null {
  return rates.length ? Math.min(...rates.map((r) => r.nightlyPriceSatang)) : null;
}

export function ShopLanding({ shop }: { shop: ShopPublic }) {
  const t = useTranslations("P-01");
  const map = mapUrl(shop);
  const price = (satang: number | null) => (satang === null ? "–" : t("startsAt", { price: formatTHB({ satang }) }));
  return (
    <main className="mx-auto grid max-w-xl gap-6 px-4 py-8">
      <header className="grid justify-items-center gap-3 text-center">
        {shop.logoUrl ? (
          // biome-ignore lint/performance/noImgElement: signed storage URL, not a static asset
          <img src={shop.logoUrl} alt={`${t("logo")} ${shop.name}`} width={96} height={96} className="size-24 rounded-full object-cover" />
        ) : null}
        <h1 className="font-semibold text-2xl">
          <span className="sr-only">{t("shopName")}: </span>
          {shop.name}
        </h1>
        <dl className="grid gap-1 text-sm">
          {shop.address ? (
            <div>
              <dt className="sr-only">{t("address")}</dt>
              <dd>
                {shop.address}
                {map ? (
                  <>
                    {" · "}
                    <a href={map} target="_blank" rel="noopener noreferrer" className="underline">
                      {t("openMap")}
                    </a>
                  </>
                ) : null}
              </dd>
            </div>
          ) : null}
          {shop.phone ? (
            <div>
              <dt className="sr-only">{t("phone")}</dt>
              <dd>
                <a href={`tel:${shop.phone}`} className="underline">
                  {shop.phone}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
      </header>

      <nav className="grid gap-2">
        {shop.liffUrl ? (
          <a href={shop.liffUrl} className="rounded-md bg-[#06C755] px-4 py-3 text-center font-semibold text-white">
            {t("bookViaLine")}
          </a>
        ) : shop.phone ? (
          // ไม่มี LINE เชื่อม → ซ่อนปุ่มจอง แสดงปุ่มโทร
          <a href={`tel:${shop.phone}`} className="rounded-md bg-primary px-4 py-3 text-center font-semibold text-primary-foreground">
            {t("call")}
          </a>
        ) : null}
        {shop.addFriendUrl ? (
          <a href={shop.addFriendUrl} className="rounded-md border px-4 py-3 text-center">
            {t("addFriend")}
          </a>
        ) : null}
      </nav>

      <section className="grid gap-2">
        <h2 className="font-semibold">{t("hours")}</h2>
        <table className="text-sm">
          <tbody>
            {hoursRows(shop.hours).map((row) => (
              <tr key={row.weekday}>
                <th scope="row" className="w-12 text-left font-normal">
                  {t(`day${row.weekday}` as "day0")}
                </th>
                <td>{row.open ?? t("closed")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {shop.services.length ? (
        <section className="grid gap-2">
          <h2 className="font-semibold">{t("services")}</h2>
          <table className="text-sm">
            <thead>
              <tr>
                <th className="text-left">{t("serviceName")}</th>
                <th className="text-right">{t("fromPrice")}</th>
              </tr>
            </thead>
            <tbody>
              {shop.services.map((s) => (
                <tr key={s.id}>
                  <td>{s.nameTh}</td>
                  <td className="text-right">{price(s.fromPriceSatang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {shop.roomTypes.length ? (
        <section className="grid gap-2">
          <table className="text-sm">
            <thead>
              <tr>
                <th className="text-left">{t("roomType")}</th>
                <th className="text-right">{t("nightlyFrom")}</th>
              </tr>
            </thead>
            <tbody>
              {shop.roomTypes.map((r) => (
                <tr key={r.id}>
                  <td>{r.nameTh}</td>
                  <td className="text-right">{price(nightlyFrom(r.rates))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </main>
  );
}
