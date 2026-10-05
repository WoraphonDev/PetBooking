"use client";

import { cn } from "cn";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../ui/button.tsx";
import { uploadErrorMessage } from "../upload/index.ts";
import { drawStrokes, isEmpty, type Stroke, toLocal } from "./strokes.ts";
import { SIGNATURE_MIME, type SignatureDeps, uploadSignature } from "./upload.ts";

/** Thai labels from the using screen's messages */
export type SignaturePadLabels = { area: string; clear: string; confirm: string; uploading: string; signed: string };

export type SignaturePadProps = SignatureDeps & {
  labels: SignaturePadLabels;
  /** fileId of the uploaded PNG, or null after clearing — e.g. groom.checkIn consent.signatureFileId */
  onChange: (fileId: string | null) => void;
  height?: number;
  disabled?: boolean;
  className?: string;
};

/** Finger / mouse signature on a canvas → PNG → presigned upload as kind `signature`. */
export function SignaturePad(props: SignaturePadProps) {
  const t = useTranslations("common");
  const { labels, height = 180, disabled } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  const [state, setState] = useState<{ stage: "idle" | "uploading" | "done" | "error"; error: string | null }>({
    stage: "idle",
    error: null,
  });

  const redraw = () => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const scale = window.devicePixelRatio || 1;
    const { width, height: h } = el.getBoundingClientRect();
    if (el.width !== Math.round(width * scale)) {
      el.width = Math.round(width * scale);
      el.height = Math.round(h * scale);
    }
    drawStrokes(ctx, strokes.current, { width, height: h }, scale);
  };
  useEffect(() => {
    redraw();
    window.addEventListener("resize", redraw);
    return () => window.removeEventListener("resize", redraw);
  });

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => toLocal(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
  const changed = () => {
    setEmpty(isEmpty(strokes.current));
    if (state.stage !== "idle") setState({ stage: "idle", error: null });
    props.onChange(null);
  };

  const clear = () => {
    strokes.current = [];
    redraw();
    changed();
  };
  const confirm = async () => {
    const el = canvas.current;
    if (!el || isEmpty(strokes.current)) return;
    setState({ stage: "uploading", error: null });
    try {
      const png = await new Promise<Blob>((resolve, reject) =>
        el.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas export failed"))), SIGNATURE_MIME),
      );
      const { width, height: h } = el.getBoundingClientRect();
      const fileId = await uploadSignature(png, { width, height: h }, props);
      setState({ stage: "done", error: null });
      props.onChange(fileId);
    } catch (err) {
      setState({ stage: "error", error: uploadErrorMessage(err) });
    }
  };
  const busy = state.stage === "uploading";

  return (
    <div data-slot="signature-pad" className={cn("flex flex-col gap-2", props.className)}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={labels.area}
        style={{ height }}
        className={cn("w-full touch-none rounded-lg border bg-white", disabled && "pointer-events-none opacity-60")}
        onPointerDown={(e) => {
          if (disabled || busy) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          strokes.current = [...strokes.current, [point(e)]];
          redraw();
          changed();
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          strokes.current[strokes.current.length - 1]?.push(point(e));
          redraw();
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      />
      {state.stage === "error" ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}
      {state.stage === "done" ? (
        <p role="status" className="text-sm text-emerald-700">
          {labels.signed}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="h-11" disabled={disabled || busy || empty} onClick={clear}>
          {labels.clear}
        </Button>
        <Button
          type="button"
          className="h-11"
          disabled={disabled || busy || empty || state.stage === "done"}
          onClick={() => void confirm()}
        >
          {busy ? labels.uploading : state.stage === "error" ? t("retry") : labels.confirm}
        </Button>
      </div>
    </div>
  );
}
