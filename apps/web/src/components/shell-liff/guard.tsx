import { ApiError } from "@app/contracts/common";
import { LiffMeParams } from "@app/contracts/endpoints/liff.me";
import { PublicBranchParams, PublicBranchResponse } from "@app/contracts/endpoints/public.branch";
import { withCustomer, withPublic } from "@app/server/http";
import { liffMe } from "@app/server/services/liff/me";
import { publicBranch } from "@app/server/services/public/branch";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { LiffForbidden, LiffShell, type LiffState } from "./liff-shell";

// The same pipelines as the routes: public.branch for the header / liffId, liff.me for the cid session of this branch.
const shop = withPublic("public.branch", { params: PublicBranchParams }, publicBranch);
const me = withCustomer("liff.me", { params: LiffMeParams }, liffMe);

/**
 * Server guard for /liff/[branchSlug]/*: unknown shop → 404; cid of this branch → shell; none / another branch's
 * (UNAUTHENTICATED) → LIFF sign-in on the client (liff.init → liff.session, Q-1030); NOT_REGISTERED → L-01 only;
 * suspended shop (FORBIDDEN) → 403 view.
 */
export async function ProtectedLiffShell({ branchSlug, children }: { branchSlug: string; children: React.ReactNode }) {
  const base = process.env.APP_BASE_URL;
  if (!base) throw new Error("APP_BASE_URL is not set");
  const url = new URL(`/liff/${encodeURIComponent(branchSlug)}`, base);
  const shopRes = await shop(new Request(url), { params: { bookingSlug: branchSlug } });
  if (shopRes.status === 404) notFound();
  if (!shopRes.ok) throw new Error(`liff guard: public.branch answered ${shopRes.status}`);
  const shopPublic = PublicBranchResponse.parse(await shopRes.json());

  const meRes = await me(new Request(url, { headers: await headers() }), { params: { branchSlug } });
  let state: LiffState = "ready";
  if (meRes.status === 401) state = "signin";
  else if (meRes.status === 403) {
    const code = ApiError.safeParse(await meRes.json()).data?.error.code;
    if (code !== "NOT_REGISTERED") return <LiffForbidden />;
    state = "register";
  } else if (meRes.status === 404) notFound();
  else if (!meRes.ok) throw new Error(`liff guard: liff.me answered ${meRes.status}`);

  return (
    <LiffShell branchSlug={branchSlug} shop={shopPublic} state={state} fake={process.env.LINE_FAKE === "1"}>
      {children}
    </LiffShell>
  );
}
