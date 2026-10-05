"use client";
import { FeedbackCreateRequest } from "@app/contracts/endpoints/feedback.create";
import { StaffUploadUrlResponse } from "@app/contracts/endpoints/staff.uploadUrl";
import { MessageSquareWarning } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "../../lib/api";
import { useApiMutation } from "../../lib/query";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Textarea } from "../ui/textarea";

/** R-25 upload: ask for a presigned PUT (kind feedback), send the file, return its id */
export async function uploadScreenshot(file: File): Promise<string> {
  const ticket = await api("staff.uploadUrl", {
    body: { kind: "feedback", mimeType: file.type, sizeBytes: file.size },
    response: StaffUploadUrlResponse,
  });
  const put = await fetch(ticket.uploadUrl, { method: "PUT", headers: ticket.headers, body: file });
  if (!put.ok) throw new Error(`upload failed: ${put.status}`);
  return ticket.fileId;
}

/** 06#scr-C-46 form: message, optional screenshot, current page and version shown automatically */
export function FeedbackForm({
  pageUrl,
  appVersion,
  onSent,
}: {
  pageUrl: string;
  /** Q-0114: no build-time version source is defined yet */
  appVersion: string | null;
  onSent: () => void;
}) {
  const t = useTranslations("C-46");
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<{ fileId: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const mutation = useApiMutation("feedback.create", { meta: { toast: false } });
  const busy = uploading || mutation.isPending;
  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const parsed = FeedbackCreateRequest.safeParse({
          pageUrl,
          message,
          ...(screenshot ? { screenshotFileId: screenshot.fileId } : {}),
          ...(appVersion ? { appVersion } : {}),
        });
        if (!parsed.success) {
          setError(t("invalid"));
          return;
        }
        setError("");
        try {
          await mutation.mutateAsync({ body: parsed.data });
          toast.success(t("thanks"));
          onSent();
        } catch (e) {
          setError(errorMessage(e));
        }
      }}
    >
      <label htmlFor="feedback-message" className="text-sm font-medium">
        {t("message")}
      </label>
      <Textarea id="feedback-message" maxLength={2000} rows={5} value={message} onChange={(event) => setMessage(event.target.value)} />
      <label htmlFor="feedback-screenshot" className="text-sm font-medium">
        {t("screenshot")}
      </label>
      {screenshot ? (
        <span className="flex items-center gap-2">
          {screenshot.name}
          <Button type="button" variant="outline" className="h-11" onClick={() => setScreenshot(null)}>
            {t("removeScreenshot")}
          </Button>
        </span>
      ) : (
        <input
          id="feedback-screenshot"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setUploading(true);
            try {
              setScreenshot({ fileId: await uploadScreenshot(file), name: file.name });
            } catch {
              setError(t("uploadFailed"));
            } finally {
              setUploading(false);
            }
          }}
        />
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <dt>{t("page")}</dt>
        <dd className="break-all">{pageUrl}</dd>
        <dt>{t("version")}</dt>
        <dd>{appVersion ?? "—"}</dd>
      </dl>
      {error ? <p role="alert">{error}</p> : null}
      <DialogFooter>
        <Button type="submit" className="h-11" disabled={busy}>
          {busy ? t("sending") : t("send")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** floating button + dialog; the shells mount it on every page (Q-0114) */
export function FeedbackWidget({ appVersion = null }: { appVersion?: string | null }) {
  const t = useTranslations("C-46");
  const [open, setOpen] = useState(false);
  const pageUrl = typeof window === "undefined" ? "" : window.location.pathname + window.location.search;
  return (
    <>
      <Button type="button" className="fixed right-4 bottom-4 z-40 h-11 shadow-lg" onClick={() => setOpen(true)} aria-label={t("open")}>
        <MessageSquareWarning className="size-4" />
        <span className="hidden sm:inline">{t("open")}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
          </DialogHeader>
          {open ? <FeedbackForm pageUrl={pageUrl} appVersion={appVersion} onSent={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
