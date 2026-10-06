import { PublicBranchResponse } from "@app/contracts/endpoints/public.branch";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShopLanding } from "@/components/p-01/shop-landing";

type Props = { params: Promise<{ bookingSlug: string }> };

/** public.branch through its own route (cached 60 s there and here); unknown / hidden shop → null */
export async function loadShop(slug: string): Promise<PublicBranchResponse | null> {
  const base = process.env.APP_BASE_URL;
  if (!base) throw new Error("APP_BASE_URL is not set");
  const res = await fetch(new URL(`/api/v1/public/branches/${encodeURIComponent(slug)}`, base), { next: { revalidate: 60 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`public.branch failed: ${res.status}`);
  return PublicBranchResponse.parse(await res.json());
}

/** SEO: title = shop name (province: Q-1037), OG image = logo */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const shop = await loadShop((await params).bookingSlug);
  if (!shop) return {};
  return { title: shop.name, openGraph: { title: shop.name, images: shop.logoUrl ? [shop.logoUrl] : [] } };
}

export default async function ShopLandingPage({ params }: Props) {
  const shop = await loadShop((await params).bookingSlug);
  if (!shop) notFound();
  return <ShopLanding shop={shop} />;
}
