// db check is added in INF-MON (see T-0001 card)
export const GET = () => Response.json({ ok: true, db: "unknown", version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev" });
