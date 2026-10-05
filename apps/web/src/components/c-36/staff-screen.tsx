"use client";
import type { StaffUserItem } from "@app/contracts/dto/staff-user-item";
import { AuthMeResponse } from "@app/contracts/endpoints/auth.me";
import { StaffUsersInviteResponse } from "@app/contracts/endpoints/staffUsers.invite";
import { StaffUsersListResponse } from "@app/contracts/endpoints/staffUsers.list";
import { StaffUsersResendInviteResponse } from "@app/contracts/endpoints/staffUsers.resendInvite";
import { StaffUsersUpdateResponse } from "@app/contracts/endpoints/staffUsers.update";
import { type StaffRole, staffRoleValues } from "@app/contracts/enums";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { FormField } from "../shared/form";
import { StatusBadge } from "../shared/table";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { Switch } from "../ui/switch";
import {
  type EditForm,
  editBody,
  emptyInvite,
  fullItems,
  type InviteErrors,
  type InviteForm,
  inviteBody,
  lineShareUrl,
  timeAgo,
  toggleStatus,
  WEEK_ORDER,
} from "./logic";

type T = ReturnType<typeof useTranslations<"C-36">>;
const ROLE_HELP = { owner: "roleOwner", front_desk: "roleFrontDesk", staff: "roleStaff" } as const;
const DAY_KEY = ["day0", "day1", "day2", "day3", "day4", "day5", "day6"] as const;
const INVALIDATE = ["staffUsers.list"] as const;

/** 06#scr-C-36 — staff list, invite (owner), edit / disable / resend (owner), weekly hours (read here; editing via workingHours.set comes later). */
export function StaffScreen() {
  const t = useTranslations("C-36");
  const common = useTranslations("common");
  const me = useApiQuery("auth.me", { response: AuthMeResponse });
  const list = useApiQuery("staffUsers.list", { response: StaffUsersListResponse });
  const invite = useApiMutation("staffUsers.invite", { response: StaffUsersInviteResponse, invalidate: [...INVALIDATE] });
  const update = useApiMutation("staffUsers.update", { response: StaffUsersUpdateResponse, invalidate: [...INVALIDATE] });
  const resend = useApiMutation("staffUsers.resendInvite", { response: StaffUsersResendInviteResponse, invalidate: [...INVALIDATE] });
  const [link, setLink] = useState<string | null>(null);
  const [editing, setEditing] = useState<StaffUserItem | null>(null);

  if (list.isPending || me.isPending) return <Skeleton className="m-6 h-96" />;
  if (list.isError)
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p role="alert">{errorMessage(list.error)}</p>
        <Button type="button" onClick={() => void list.refetch()}>
          {common("retry")}
        </Button>
      </div>
    );
  const isOwner = me.data?.staff.role === "owner";
  const staff = fullItems(list.data);
  const showWarnings = (warnings: { message: string }[] | undefined) => {
    for (const w of warnings ?? []) toast.warning(w.message);
  };
  return (
    <div data-screen="C-36" className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>
      <StaffList
        t={t}
        staff={staff}
        now={Date.now()}
        isOwner={isOwner}
        busy={update.isPending || resend.isPending}
        onEdit={setEditing}
        onToggle={async (s) => {
          const body = toggleStatus(s);
          if (!body) return;
          const res = await update.mutateAsync({ params: { staffUserId: s.id }, body });
          toast.success(t("saved"));
          showWarnings(res.warnings);
        }}
        onResend={async (s) => {
          const res = await resend.mutateAsync({ params: { staffUserId: s.id } });
          setLink(res.inviteUrl);
        }}
      />
      {isOwner ? (
        <InviteSection
          t={t}
          busy={invite.isPending}
          onInvite={async (body) => {
            const res = await invite.mutateAsync({ body });
            setLink(res.inviteUrl);
          }}
        />
      ) : null}
      <HoursTable t={t} staff={staff.filter((s) => s.status !== "disabled")} />
      <InviteLinkDialog t={t} url={link} closeLabel={common("close")} onClose={() => setLink(null)} />
      <EditDialog
        t={t}
        staff={editing}
        busy={update.isPending}
        cancelLabel={common("cancel")}
        onClose={() => setEditing(null)}
        onSave={async (before, form) => {
          const body = editBody(before, form);
          if (body) {
            const res = await update.mutateAsync({ params: { staffUserId: before.id }, body });
            showWarnings(res.warnings);
          }
          setEditing(null);
          toast.success(t("saved"));
        }}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="font-medium text-lg">{title}</h2>
      {children}
    </section>
  );
}

export function StaffList(props: {
  t: T;
  staff: StaffUserItem[];
  now: number;
  isOwner: boolean;
  busy: boolean;
  onEdit: (s: StaffUserItem) => void;
  onToggle: (s: StaffUserItem) => void;
  onResend: (s: StaffUserItem) => void;
}) {
  const { t } = props;
  const ago = (instant: string | null) => {
    if (!instant) return t("never");
    const { key, n } = timeAgo(instant, props.now);
    return t(key, { n });
  };
  return (
    <Section title={t("sectionList")}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-2">{t("name")}</th>
            <th className="py-2">{t("role")}</th>
            <th className="py-2">{t("isGroomer")}</th>
            <th className="py-2">{t("status")}</th>
            <th className="py-2">{t("line")}</th>
            <th className="py-2">{t("lastLogin")}</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {props.staff.map((s) => (
            <tr key={s.id} className="border-t">
              <td className="py-2">
                <span className="flex items-center gap-2">
                  {s.photoUrl ? (
                    // biome-ignore lint/performance/noImgElement: signed storage URL, not a Next static asset
                    <img src={s.photoUrl} alt="" className="size-8 rounded-full object-cover" />
                  ) : (
                    <span className="size-8 rounded-full bg-muted" />
                  )}
                  {s.displayName}
                </span>
              </td>
              <td className="py-2">{enumLabel("staff_role", s.role)}</td>
              <td className="py-2">{s.isGroomer ? "✓" : ""}</td>
              <td className="py-2">
                <StatusBadge enumName="staff_status" value={s.status} />
              </td>
              <td className="py-2">
                <span
                  role="img"
                  aria-label={t(s.lineLinked ? "lineLinked" : "lineNotLinked")}
                  title={t(s.lineLinked ? "lineLinked" : "lineNotLinked")}
                >
                  {s.lineLinked ? "🟢" : "⚪"}
                </span>
              </td>
              <td className="py-2">{ago(s.lastLoginAt)}</td>
              <td className="py-2 text-right">
                {props.isOwner ? (
                  <span className="flex justify-end gap-1">
                    <Button type="button" size="sm" variant="outline" disabled={props.busy} onClick={() => props.onEdit(s)}>
                      {t("edit")}
                    </Button>
                    {s.status !== "invited" ? (
                      <Button type="button" size="sm" variant="outline" disabled={props.busy} onClick={() => props.onToggle(s)}>
                        {t(s.status === "active" ? "disable" : "enable")}
                      </Button>
                    ) : (
                      <Button type="button" size="sm" variant="outline" disabled={props.busy} onClick={() => props.onResend(s)}>
                        {t("resend")}
                      </Button>
                    )}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function RoleRadio({ t, value, onPick }: { t: T; value: StaffRole; onPick: (r: StaffRole) => void }) {
  return (
    <div role="radiogroup" aria-label={t("role")} className="flex flex-col gap-2">
      {staffRoleValues.map((r) => (
        <label key={r} className="flex min-h-11 items-start gap-3 rounded-lg border p-3">
          <input type="radio" name="c36-role" checked={value === r} onChange={() => onPick(r)} className="mt-1" />
          <span className="flex flex-col">
            <span className="font-medium">{enumLabel("staff_role", r)}</span>
            <span className="text-muted-foreground text-xs">{t(ROLE_HELP[r])}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

export function InviteSection(props: {
  t: T;
  busy: boolean;
  onInvite: (body: NonNullable<ReturnType<typeof inviteBody>["body"]>) => Promise<void>;
}) {
  const { t } = props;
  const [form, setForm] = useState<InviteForm>(emptyInvite);
  const [errors, setErrors] = useState<InviteErrors>({});
  return (
    <Section title={t("sectionInvite")}>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField id="c36-name" label={t("displayName")} error={errors.displayName ? t("invalid") : undefined}>
          <Input
            id="c36-name"
            className="h-11"
            maxLength={40}
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          />
        </FormField>
        <FormField id="c36-email" label={t("email")} error={errors.email ? t("invalid") : undefined}>
          <Input
            id="c36-email"
            type="email"
            className="h-11"
            placeholder={t("emailHint")}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </FormField>
        <FormField id="c36-role" label={t("role")}>
          <RoleRadio t={t} value={form.role} onPick={(role) => setForm({ ...form, role })} />
        </FormField>
        <label htmlFor="c36-groomer" className="flex min-h-11 items-center justify-between gap-3 self-start">
          <span className="font-medium text-sm">{t("groomerToggle")}</span>
          <Switch id="c36-groomer" checked={form.isGroomer} onCheckedChange={(isGroomer) => setForm({ ...form, isGroomer })} />
        </label>
      </div>
      <Button
        type="button"
        className="h-11 self-end"
        disabled={props.busy}
        onClick={() => {
          const { body, errors: found } = inviteBody(form);
          setErrors(found);
          if (body) void props.onInvite(body).then(() => setForm(emptyInvite()));
        }}
      >
        {t("invite")}
      </Button>
    </Section>
  );
}

/** weekly hours from staffUsers.list (edit via workingHours.set is a later task — card step 2) */
export function HoursTable({ t, staff }: { t: T; staff: StaffUserItem[] }) {
  return (
    <Section title={t("sectionHours")}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2">{t("name")}</th>
              {WEEK_ORDER.map((d) => (
                <th key={d} className="py-2">
                  {t(DAY_KEY[d] ?? "day0")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className="border-t align-top">
                <td className="py-2 font-medium">{s.displayName}</td>
                {WEEK_ORDER.map((d) => {
                  const h = s.workingHours.find((x) => x.weekday === d);
                  return (
                    <td key={d} className="py-2 text-xs" data-weekday={d}>
                      {h ? (
                        <>
                          <span className="block">
                            {h.startsAt}–{h.endsAt}
                          </span>
                          {h.breakStartsAt && h.breakEndsAt ? (
                            <span className="block text-muted-foreground">
                              {t("break")} {h.breakStartsAt}–{h.breakEndsAt}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-muted-foreground">{t("dayOff")}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export function InviteLinkDialog({ t, url, closeLabel, onClose }: { t: T; url: string | null; closeLabel: string; onClose: () => void }) {
  return (
    <Dialog open={url !== null} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("inviteTitle")}</DialogTitle>
        </DialogHeader>
        <Input readOnly className="h-11 font-mono text-xs" value={url ?? ""} aria-label={t("inviteTitle")} />
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" onClick={onClose}>
            {closeLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => url && void navigator.clipboard.writeText(url).then(() => toast.success(t("copied")))}
          >
            {t("copy")}
          </Button>
          {url ? (
            <Button asChild className="h-11">
              <a href={lineShareUrl(url)} target="_blank" rel="noreferrer">
                {t("sendLine")}
              </a>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditDialog(props: {
  t: T;
  staff: StaffUserItem | null;
  busy: boolean;
  cancelLabel: string;
  onClose: () => void;
  onSave: (before: StaffUserItem, form: EditForm) => Promise<void>;
}) {
  const { t, staff } = props;
  const [form, setForm] = useState<EditForm | null>(null);
  const current = form ?? (staff ? { displayName: staff.displayName, role: staff.role, isGroomer: staff.isGroomer } : null);
  return (
    <Dialog
      open={staff !== null}
      onOpenChange={(o) => {
        if (o) return;
        setForm(null);
        props.onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
        </DialogHeader>
        {current ? (
          <div className="flex flex-col gap-3">
            <FormField id="c36-edit-name" label={t("displayName")} error={current.displayName.trim() ? undefined : t("invalid")}>
              <Input
                id="c36-edit-name"
                className="h-11"
                maxLength={40}
                value={current.displayName}
                onChange={(e) => setForm({ ...current, displayName: e.target.value })}
              />
            </FormField>
            <RoleRadio t={t} value={current.role} onPick={(role) => setForm({ ...current, role })} />
            <label htmlFor="c36-edit-groomer" className="flex min-h-11 items-center justify-between gap-3">
              <span className="font-medium text-sm">{t("groomerToggle")}</span>
              <Switch
                id="c36-edit-groomer"
                checked={current.isGroomer}
                onCheckedChange={(isGroomer) => setForm({ ...current, isGroomer })}
              />
            </label>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" onClick={props.onClose}>
            {props.cancelLabel}
          </Button>
          <Button
            type="button"
            className="h-11"
            disabled={props.busy || !current?.displayName.trim()}
            onClick={() => staff && current && void props.onSave(staff, current).then(() => setForm(null))}
          >
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
