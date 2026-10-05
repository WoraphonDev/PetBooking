"use client";

import type { FileKind } from "@app/contracts/enums";
import { cn } from "cn";
import { Camera, Images, RotateCw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../ui/button.tsx";
import { type UploadDeps, type UploadStage, uploadErrorMessage, uploadOne } from "./upload.ts";

/** A file ready to reference: `url` is the signed GET URL from the API, or a local preview for a new upload. */
export type UploadedPhoto = { fileId: string; url: string };

/** Thai labels from the using screen's messages (06 field label of that screen). */
export type PhotoUploaderLabels = { camera: string; album: string; uploading: string };

type Pending = {
  key: string;
  file: File;
  previewUrl: string;
  stage: UploadStage | "error";
  progress: number;
  error: string | null;
};

export type PhotoUploaderProps = UploadDeps & {
  kind: FileKind;
  value: UploadedPhoto[];
  onChange: (next: UploadedPhoto[]) => void;
  labels: PhotoUploaderLabels;
  /** several files per pick (album) and several photos in total */
  multiple?: boolean;
  /** cap on value + pending; default 1 when !multiple */
  max?: number;
  /** input accept; default "image/*" (vaccine_proof may add "application/pdf") */
  accept?: string;
  /** true while any file is preparing/uploading — screens keep submit disabled meanwhile */
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  className?: string;
};

/** Percent shown on an uploading tile: preparing counts as 0 %. */
export function progressPercent(stage: UploadStage | "error", fraction: number): number {
  if (stage !== "uploading") return 0;
  return Math.min(100, Math.max(0, Math.round(fraction * 100)));
}

/** How many more files may be picked. */
export function remainingSlots(max: number, taken: number): number {
  return Math.max(0, max - taken);
}

let seq = 0;

/** Camera / album picker → R-25 resize → presigned PUT with progress; emits fileIds through onChange. */
export function PhotoUploader(props: PhotoUploaderProps) {
  const t = useTranslations("common");
  const { kind, value, onChange, labels, multiple = false, accept = "image/*", onBusyChange, disabled } = props;
  const max = props.max ?? (multiple ? Number.POSITIVE_INFINITY : 1);
  const [pending, setPending] = useState<Pending[]>([]);
  const valueRef = useRef(value);
  valueRef.current = value;
  const depsRef = useRef<UploadDeps>(props);
  depsRef.current = props;
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const localUrls = useRef(new Set<string>());

  const busy = pending.some((p) => p.stage !== "error");
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);
  useEffect(() => {
    const urls = localUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  const patch = (key: string, next: Partial<Pending>) => setPending((list) => list.map((p) => (p.key === key ? { ...p, ...next } : p)));

  const run = async (item: Pending) => {
    patch(item.key, { stage: "preparing", progress: 0, error: null });
    try {
      const { fileId } = await uploadOne(kind, item.file, depsRef.current, (stage, progress) => patch(item.key, { stage, progress }));
      setPending((list) => list.filter((p) => p.key !== item.key));
      onChange([...valueRef.current, { fileId, url: item.previewUrl }]);
    } catch (err) {
      patch(item.key, { stage: "error", error: uploadErrorMessage(err) });
    }
  };

  const pick = (files: FileList | null) => {
    if (!files) return;
    const room = remainingSlots(max, valueRef.current.length + pending.length);
    const items = Array.from(files)
      .slice(0, room)
      .map((file): Pending => {
        const previewUrl = URL.createObjectURL(file);
        localUrls.current.add(previewUrl);
        return { key: `upload-${++seq}`, file, previewUrl, stage: "preparing", progress: 0, error: null };
      });
    setPending((list) => [...list, ...items]);
    for (const item of items) void run(item);
  };

  const dropPending = (item: Pending) => {
    setPending((list) => list.filter((p) => p.key !== item.key));
    URL.revokeObjectURL(item.previewUrl);
    localUrls.current.delete(item.previewUrl);
  };

  const full = remainingSlots(max, value.length + pending.length) === 0;
  const pickDisabled = disabled || full;

  return (
    <div data-slot="photo-uploader" className={cn("flex flex-col gap-3", props.className)}>
      {value.length + pending.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {value.map((photo) => (
            <li key={photo.fileId} data-file-id={photo.fileId} className="relative aspect-square overflow-hidden rounded-lg border">
              {/* biome-ignore lint/performance/noImgElement: signed storage URL, not a Next static asset */}
              <img src={photo.url} alt="" className="size-full object-cover" />
              <Button
                type="button"
                size="icon-xs"
                variant="secondary"
                className="absolute top-1 right-1"
                aria-label={t("delete")}
                disabled={disabled}
                onClick={() => onChange(valueRef.current.filter((p) => p.fileId !== photo.fileId))}
              >
                <X />
              </Button>
            </li>
          ))}
          {pending.map((item) => (
            <li key={item.key} data-stage={item.stage} className="relative aspect-square overflow-hidden rounded-lg border">
              {/* biome-ignore lint/performance/noImgElement: local blob preview of the picked file */}
              <img src={item.previewUrl} alt="" className="size-full object-cover opacity-60" />
              {item.stage === "error" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/80 p-1 text-center">
                  <p role="alert" className="text-destructive text-xs">
                    {item.error}
                  </p>
                  <div className="flex gap-1">
                    <Button type="button" size="xs" variant="outline" disabled={disabled} onClick={() => void run(item)}>
                      <RotateCw />
                      {t("retry")}
                    </Button>
                    <Button type="button" size="icon-xs" variant="ghost" aria-label={t("delete")} onClick={() => dropPending(item)}>
                      <X />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="absolute inset-x-1 bottom-1 flex flex-col gap-1">
                  <span className="text-xs">{labels.uploading}</span>
                  <div
                    role="progressbar"
                    aria-label={labels.uploading}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progressPercent(item.stage, item.progress)}
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                  >
                    <div className="h-full bg-primary transition-all" style={{ width: `${progressPercent(item.stage, item.progress)}%` }} />
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" disabled={pickDisabled} onClick={() => cameraRef.current?.click()}>
          <Camera />
          {labels.camera}
        </Button>
        <Button type="button" variant="outline" disabled={pickDisabled} onClick={() => albumRef.current?.click()}>
          <Images />
          {labels.album}
        </Button>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          pick(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />
      <input
        ref={albumRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          pick(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />
    </div>
  );
}
