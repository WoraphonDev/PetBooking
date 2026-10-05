"use client";

import { cn } from "cn";
import { ImageUp, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../ui/button.tsx";
import { progressPercent, type UploadStage, uploadErrorMessage } from "../upload/index.ts";
import { type SlipDeps, type UploadedSlip, uploadSlip } from "./slip.ts";

/** Thai labels from the using screen's messages */
export type SlipUploaderLabels = { pick: string; uploading: string };

type State = { stage: UploadStage | "error" | "done"; progress: number; error: string | null };

export type SlipUploaderProps = SlipDeps & {
  labels: SlipUploaderLabels;
  /** fileId + qrPayload (null when the QR was unreadable) for liff.uploadSlip / liff.payUploadSlip */
  onUploaded: (slip: UploadedSlip) => void;
  disabled?: boolean;
  className?: string;
};

/** Pick one slip image → read its QR (R-05) → R-25 resize → presigned PUT with progress. */
export function SlipUploader(props: SlipUploaderProps) {
  const t = useTranslations("common");
  const { labels, disabled } = props;
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<State | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const depsRef = useRef<SlipUploaderProps>(props);
  depsRef.current = props;

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const run = async (picked: File) => {
    setState({ stage: "preparing", progress: 0, error: null });
    try {
      const slip = await uploadSlip(picked, depsRef.current, (stage, progress) => setState({ stage, progress, error: null }));
      setState({ stage: "done", progress: 1, error: null });
      depsRef.current.onUploaded(slip);
    } catch (err) {
      setState({ stage: "error", progress: 0, error: uploadErrorMessage(err) });
    }
  };
  const busy = state?.stage === "preparing" || state?.stage === "uploading";

  return (
    <div data-slot="slip-uploader" className={cn("flex flex-col gap-3", props.className)}>
      {preview ? (
        <div className="relative overflow-hidden rounded-lg border">
          {/* biome-ignore lint/performance/noImgElement: local blob preview of the picked slip */}
          <img src={preview} alt="" className={cn("max-h-80 w-full object-contain", busy && "opacity-60")} />
          {busy ? (
            <div className="absolute inset-x-2 bottom-2 flex flex-col gap-1">
              <span className="text-xs">{labels.uploading}</span>
              <div
                role="progressbar"
                aria-label={labels.uploading}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent(state.stage as UploadStage, state.progress)}
                className="h-1.5 overflow-hidden rounded-full bg-muted"
              >
                <div className="h-full bg-primary" style={{ width: `${progressPercent(state.stage as UploadStage, state.progress)}%` }} />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {state?.stage === "error" ? (
        <div className="flex items-center gap-2">
          <p role="alert" className="text-destructive text-sm">
            {state.error}
          </p>
          {file ? (
            <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => void run(file)}>
              <RotateCw />
              {t("retry")}
            </Button>
          ) : null}
        </div>
      ) : null}
      <Button type="button" variant="outline" className="h-11" disabled={disabled || busy} onClick={() => input.current?.click()}>
        <ImageUp />
        {labels.pick}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const picked = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (!picked) return;
          setFile(picked);
          setPreview(URL.createObjectURL(picked));
          void run(picked);
        }}
      />
    </div>
  );
}
