"use client";
import type { ReportCardDetail } from "@app/contracts/dto/report-card-detail";
import { ReportCardsApproveResponse } from "@app/contracts/endpoints/reportCards.approve";
import { ReportCardsListResponse } from "@app/contracts/endpoints/reportCards.list";
import { type ReportCardsUpdateRequest, ReportCardsUpdateResponse } from "@app/contracts/endpoints/reportCards.update";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { FormField } from "../shared/form";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { Textarea } from "../ui/textarea";

type T = ReturnType<typeof useTranslations<"C-21">>;
export const NOTE_MAX = 500;
export const RECOMMENDATION_MAX = 300;

/** reportCards.update for the two editable texts (blank = cleared); null when too long */
export function textsBody(staffNote: string, recommendation: string): ReportCardsUpdateRequest | null {
  const [n, r] = [staffNote.trim(), recommendation.trim()];
  if (n.length > NOTE_MAX || r.length > RECOMMENDATION_MAX) return null;
  return { staffNote: n || null, recommendation: r || null };
}

/** ผลตรวจ tags in 06 order (ผิว / หู / เล็บ / ฟัน / ปรสิต); unset findings are left out */
export function findings(c: ReportCardDetail): { key: "skin" | "ears" | "nails" | "teeth" | "parasites"; label: string }[] {
  const out: { key: "skin" | "ears" | "nails" | "teeth" | "parasites"; label: string }[] = [];
  if (c.skin) out.push({ key: "skin", label: enumLabel("skin_condition", c.skin) });
  if (c.ears) out.push({ key: "ears", label: enumLabel("ear_condition", c.ears) });
  if (c.nails) out.push({ key: "nails", label: enumLabel("nail_condition", c.nails) });
  if (c.teeth) out.push({ key: "teeth", label: enumLabel("teeth_condition", c.teeth) });
  if (c.parasites) out.push({ key: "parasites", label: enumLabel("parasite_finding", c.parasites) });
  return out;
}

/** 06#scr-C-21 — report cards waiting for review: edit the customer texts, then send. */
export function ReportCardsScreen() {
  const t = useTranslations("C-21");
  const common = useTranslations("common");
  const list = useApiQuery("reportCards.list", { query: { status: "pending_review" }, response: ReportCardsListResponse });
  const invalidate = ["reportCards.list", "dashboard.today"] as const;
  const update = useApiMutation("reportCards.update", { response: ReportCardsUpdateResponse, invalidate: [...invalidate] });
  const approve = useApiMutation("reportCards.approve", { response: ReportCardsApproveResponse, invalidate: [...invalidate] });
  if (list.isPending) return <Skeleton className="m-6 h-96" />;
  if (list.isError)
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p role="alert">{errorMessage(list.error)}</p>
        <Button type="button" onClick={() => void list.refetch()}>
          {common("retry")}
        </Button>
      </div>
    );
  return (
    <div data-screen="C-21" className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>
      {list.data.length === 0 ? <p className="text-muted-foreground">{t("empty")}</p> : null}
      {list.data.map((c) => (
        <ReportCardItem
          key={c.id}
          t={t}
          card={c}
          busy={update.isPending || approve.isPending}
          onSave={async (body) => {
            await update.mutateAsync({ params: { reportCardId: c.id }, body });
            toast.success(t("saved"));
          }}
          onSend={async (body) => {
            // save the edited texts first, then send
            await update.mutateAsync({ params: { reportCardId: c.id }, body });
            await approve.mutateAsync({ params: { reportCardId: c.id } });
            toast.success(t("sent"));
          }}
        />
      ))}
    </div>
  );
}

export function ReportCardItem(props: {
  t: T;
  card: ReportCardDetail;
  busy: boolean;
  onSave: (body: ReportCardsUpdateRequest) => Promise<void>;
  onSend: (body: ReportCardsUpdateRequest) => Promise<void>;
}) {
  const { t, card } = props;
  const [note, setNote] = useState(card.staffNote ?? "");
  const [rec, setRec] = useState(card.recommendation ?? "");
  const body = textsBody(note, rec);
  const after = card.afterPhotos[0];
  return (
    <article className="flex flex-col gap-3 rounded-xl border p-4 md:flex-row">
      {after ? (
        // biome-ignore lint/performance/noImgElement: signed storage URL, not a Next static asset
        <img src={after.url} alt={after.caption ?? card.pet.name} className="aspect-square w-full rounded-lg object-cover md:w-48" />
      ) : null}
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap gap-4 text-sm">
          <span>
            <span className="text-muted-foreground">{t("pet")} </span>
            <span className="font-semibold">{card.pet.name}</span>
          </span>
          <span>
            <span className="text-muted-foreground">{t("groomer")} </span>
            {card.groomerName}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-sm" data-field="findings">
          <span className="text-muted-foreground">{t("findings")}</span>
          {findings(card).length === 0 ? <span>{t("none")}</span> : null}
          {findings(card).map((f) => (
            <span key={f.key} className="rounded-full bg-muted px-2 py-0.5 text-xs">
              {t(f.key)}: {f.label}
            </span>
          ))}
        </div>
        <FormField id={`c21-note-${card.id}`} label={t("staffNote")} error={note.trim().length > NOTE_MAX ? t("invalid") : undefined}>
          <Textarea id={`c21-note-${card.id}`} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
        <FormField
          id={`c21-rec-${card.id}`}
          label={t("recommendation")}
          error={rec.trim().length > RECOMMENDATION_MAX ? t("invalid") : undefined}
        >
          <Textarea id={`c21-rec-${card.id}`} maxLength={RECOMMENDATION_MAX} value={rec} onChange={(e) => setRec(e.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={!body || props.busy}
            onClick={() => body && void props.onSave(body)}
          >
            {t("save")}
          </Button>
          {card.status === "pending_review" ? (
            <Button type="button" className="h-11" disabled={!body || props.busy} onClick={() => body && void props.onSend(body)}>
              {t("send")}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
