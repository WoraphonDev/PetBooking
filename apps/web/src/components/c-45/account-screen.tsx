"use client";
import { AuthMeResponse } from "@app/contracts/endpoints/auth.me";
import { StaffMeSessionsResponse } from "@app/contracts/endpoints/staffMe.sessions";
import { toLocalDate } from "@app/domain/time/local-time";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { formatThaiDate, formatTime } from "../../lib/format";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { Button } from "../ui/button";

type DeviceLabel = "unknown" | "edge" | "chrome" | "firefox" | "safari" | "android" | "ios" | "windows" | "mac" | "linux";
export function deviceName(agent: string | null, t: (key: DeviceLabel) => string): string {
  if (!agent) return t("unknown");
  const browser = /Edg/i.test(agent)
    ? "edge"
    : /Chrome/i.test(agent)
      ? "chrome"
      : /Firefox/i.test(agent)
        ? "firefox"
        : /Safari/i.test(agent)
          ? "safari"
          : null;
  const os = /Android/i.test(agent)
    ? "android"
    : /iPhone|iPad/i.test(agent)
      ? "ios"
      : /Windows/i.test(agent)
        ? "windows"
        : /Mac/i.test(agent)
          ? "mac"
          : /Linux/i.test(agent)
            ? "linux"
            : null;
  return [browser ? t(browser) : null, os ? t(os) : null].filter(Boolean).join(" · ") || agent;
}
export function AccountDevices({ sessions, timezone }: { sessions: StaffMeSessionsResponse; timezone: string }) {
  const t = useTranslations("C-45");
  const [message, setMessage] = useState("");
  const mutation = useApiMutation("staffMe.revokeSession", { invalidate: ["staffMe.sessions"], meta: { toast: false } });
  return (
    <section className="grid gap-4">
      <h2 className="font-semibold">
        {t("devices")} · {t("list")}
      </h2>
      <ul className="grid gap-3">
        {sessions.map((session) => (
          <li key={session.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
            <div>
              <p className="font-medium">{deviceName(session.userAgent, t)}</p>
              <p>
                {formatThaiDate({ date: toLocalDate({ instant: session.lastSeenAt, timezone }) })}{" "}
                {formatTime({ instant: session.lastSeenAt, timezone })}
              </p>
            </div>
            {session.current ? <span>{t("current")}</span> : null}
            {session.current ? null : (
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={mutation.isPending}
                onClick={async () => {
                  if (mutation.isPending || session.current) return;
                  setMessage("");
                  try {
                    await mutation.mutateAsync({ params: { sessionId: session.id } });
                    setMessage(t("revoked"));
                  } catch (error) {
                    setMessage(errorMessage(error));
                  }
                }}
              >
                {t("revoke")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {sessions.length === 0 ? <p>{t("empty")}</p> : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
export function AccountScreen() {
  const t = useTranslations("C-45");
  const me = useApiQuery("auth.me", { response: AuthMeResponse });
  const sessions = useApiQuery("staffMe.sessions", { response: StaffMeSessionsResponse });
  return (
    <section className="grid gap-6">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      {me.isPending || sessions.isPending ? (
        <p role="status">{t("loading")}</p>
      ) : me.isError || sessions.isError ? (
        <p role="alert">{errorMessage(me.error ?? sessions.error)}</p>
      ) : me.data && sessions.data ? (
        <>
          <section className="grid gap-3">
            <h2 className="font-semibold">{t("profile")}</h2>
            <dl className="grid gap-3 md:grid-cols-3">
              <div>
                <dt>{t("name")}</dt>
                <dd>{me.data.staff.displayName}</dd>
              </div>
              <div>
                <dt>{t("email")}</dt>
                <dd>{me.data.staff.email ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("role")}</dt>
                <dd>{enumLabel("staff_role", me.data.staff.role)}</dd>
              </div>
            </dl>
          </section>
          <AccountDevices sessions={sessions.data} timezone={me.data.branch.timezone} />
        </>
      ) : null}
    </section>
  );
}
