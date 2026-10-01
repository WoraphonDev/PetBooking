export type RequestLog = {
  requestId: string;
  orgId: string | null;
  key: string;
  ms: number;
  status: number;
};

/** Explicit allowlist: never serialize a request, body, cookie or exception. */
export function logRequest(entry: RequestLog): void {
  const { requestId, orgId, key, ms, status } = entry;
  const line = JSON.stringify({ requestId, orgId, key, ms, status });
  if (status >= 500) console.error(line);
  else {
    // biome-ignore lint/suspicious/noConsole: approved structured operational logs go to stdout.
    console.info(line);
  }
}
