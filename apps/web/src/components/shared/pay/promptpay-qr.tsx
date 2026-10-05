"use client";

import { cn } from "cn";
import { useMemo } from "react";
import { encodeQr, qrPath } from "./qr.ts";

const QUIET = 4;

/** R-30 PromptPay QR: renders the server's EMVCo payload (PaymentInstruction.promptpayPayload) as an SVG QR code. */
export function PromptPayQR({
  payload,
  label,
  size = 240,
  className,
}: {
  payload: string;
  label: string;
  size?: number;
  className?: string;
}) {
  const modules = useMemo(() => encodeQr(payload), [payload]);
  const extent = modules.length + QUIET * 2;
  return (
    <svg
      data-slot="promptpay-qr"
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${extent} ${extent}`}
      shapeRendering="crispEdges"
      className={cn("rounded-lg bg-white", className)}
    >
      <rect width={extent} height={extent} fill="#fff" />
      <path d={qrPath(modules, QUIET)} fill="#000" />
    </svg>
  );
}
