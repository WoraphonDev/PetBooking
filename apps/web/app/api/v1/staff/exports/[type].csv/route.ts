import { ExportsCsvParams, ExportsCsvQuery } from "@app/contracts/endpoints/exports.csv";
import { withStaff } from "@app/server/http";
import { exportsCsv } from "@app/server/services/exports/csv";

const handler = withStaff("exports.csv", { query: ExportsCsvQuery, params: ExportsCsvParams }, exportsCsv);

/**
 * Q-0041: Next.js has no `[type].csv` segment param and withStaff always answers JSON, so the type comes from the path
 * and a successful JSON string body is re-sent as text/csv.
 */
export async function GET(req: Request): Promise<Response> {
  const type = decodeURIComponent(new URL(req.url).pathname.match(/\/exports\/([^/]+)\.csv$/)?.[1] ?? "");
  const res = await handler(req, { params: { type } });
  if (res.status !== 200) return res;
  return new Response((await res.json()) as string, {
    status: 200,
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${type}.csv"` },
  });
}
