"use client";

import { cn } from "cn";
import { useEffect, useRef, useState } from "react";

/** ms left until `expiresAt` (never negative) */
export function remainingMs(expiresAt: string, now: number): number {
  return Math.max(0, Date.parse(expiresAt) - now);
}

/** "m:ss", or "h:mm:ss" from an hour (rounded up so 0:00 shows only when time is really up) */
export function formatCountdown(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const [h, m, sec] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Ticking countdown to a deadline (e.g. booking.hold_expires_at); calls onExpire once when it reaches 0. */
export function Countdown({
  expiresAt,
  onExpire,
  expiredLabel,
  className,
}: {
  expiresAt: string;
  onExpire?: () => void;
  /** shown instead of 0:00 once the deadline has passed */
  expiredLabel: string;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(false);
  const left = remainingMs(expiresAt, now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (left === 0 && !fired.current) {
      fired.current = true;
      onExpire?.();
    }
  }, [left, onExpire]);
  return (
    <span data-slot="countdown" role="timer" aria-live="off" className={cn("tabular-nums", left === 0 && "text-destructive", className)}>
      {left === 0 ? expiredLabel : formatCountdown(left)}
    </span>
  );
}
