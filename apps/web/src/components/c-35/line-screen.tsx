"use client";
import { BranchGetResponse } from "@app/contracts/endpoints/branch.get";
import { LineStatusResponse } from "@app/contracts/endpoints/line.status";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "../../lib/api";
import { useApiQuery } from "../../lib/query";
import { StatusBadge } from "../shared/table";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { PAPER, type PaperSize, posterSvg, storefrontUrl, usagePercent } from "./logic";

type T = ReturnType<typeof useTranslations<"C-35">>;
/** PNG export resolution */
const PX_PER_MM = 150 / 25.4;

/** 06#scr-C-35 — LINE OA connection, push quota, booking links and a QR poster of the storefront. */
export function LineScreen() {
  const t = useTranslations("C-35");
  const common = useTranslations("common");
  const line = useApiQuery("line.status", { response: LineStatusResponse });
  // ลิงก์หน้าร้าน = branch.booking_slug (LineStatus has no slug — Q-1026)
  const branch = useApiQuery("branch.get", { response: BranchGetResponse });
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  if (line.isPending || branch.isPending) return <Skeleton className="m-6 h-96" />;
  if (line.isError || branch.isError)
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p role="alert">{errorMessage(line.error ?? branch.error)}</p>
        <Button
          type="button"
          onClick={() => {
            void line.refetch();
            void branch.refetch();
          }}
        >
          {common("retry")}
        </Button>
      </div>
    );
  const s = line.data;
  return (
    <div data-screen="C-35" className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>
      <StatusSection t={t} status={s} />
      <LinksSection t={t} liffUrl={s.liffUrl} storefront={storefrontUrl(origin, branch.data.bookingSlug)} shopName={branch.data.name} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

/** สถานะ: การเชื่อม (badge + 'ทีมงานตั้งค่าให้'), LINE ID, โควตา, ใช้ไปเดือนนี้ (progress) */
export function StatusSection({ t, status: s }: { t: T; status: LineStatusResponse }) {
  const pct = usagePercent(s.usedThisMonth, s.monthlyPushQuota);
  return (
    <section className="flex flex-col gap-1 rounded-xl border p-4">
      <h2 className="font-medium text-lg">{t("sectionStatus")}</h2>
      <Row label={t("connection")}>
        <StatusBadge enumName="line_channel_status" value={s.status} />
        {s.status === "pending" ? <span className="ml-2 text-muted-foreground text-xs">{t("pendingHint")}</span> : null}
      </Row>
      <Row label={t("lineId")}>{s.botBasicId ?? t("none")}</Row>
      <Row label={t("quota")}>
        <span className="tabular-nums">{s.monthlyPushQuota.toLocaleString("th-TH")}</span>
      </Row>
      <Row label={t("used")}>
        <span className="flex items-center gap-2">
          <progress value={pct} max={100} aria-label={t("used")} className="h-2 w-32" />
          <span className="tabular-nums">
            {t("usedOf", { used: s.usedThisMonth.toLocaleString("th-TH"), quota: s.monthlyPushQuota.toLocaleString("th-TH") })}
          </span>
        </span>
      </Row>
    </section>
  );
}

function CopyField({ t, label, value }: { t: T; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium text-sm">{label}</span>
      <div className="flex gap-2">
        <Input readOnly aria-label={label} className="h-11 font-mono text-xs" value={value} />
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => void navigator.clipboard.writeText(value).then(() => toast.success(t("copied")))}
        >
          {t("copy")}
        </Button>
      </div>
    </div>
  );
}

/** ลิงก์และโปสเตอร์: ลิงก์จองใน LINE, ลิงก์หน้าร้าน, QR poster A4/A5 + PNG / PDF made on the client */
export function LinksSection(props: { t: T; liffUrl: string; storefront: string; shopName: string }) {
  const { t } = props;
  const [size, setSize] = useState<PaperSize>("A4");
  const svg = posterSvg({ size, url: props.storefront, title: props.shopName, caption: t("posterCaption") });
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="font-medium text-lg">{t("sectionLinks")}</h2>
      <CopyField t={t} label={t("liffUrl")} value={props.liffUrl} />
      <CopyField t={t} label={t("storefront")} value={props.storefront} />
      <div className="flex flex-col gap-2">
        <span className="font-medium text-sm">{t("poster")}</span>
        <div role="radiogroup" aria-label={t("poster")} className="flex gap-2">
          {(["A4", "A5"] as const).map((p) => (
            <Button
              key={p}
              type="button"
              role="radio"
              aria-checked={size === p}
              variant={size === p ? "default" : "outline"}
              className="h-11"
              onClick={() => setSize(p)}
            >
              {p}
            </Button>
          ))}
        </div>
        <div
          data-slot="poster-preview"
          className="w-64 overflow-hidden rounded border shadow-sm [&>svg]:h-auto [&>svg]:w-full"
          // the poster is our own SVG string (escaped text, generated QR path)
          // biome-ignore lint/security/noDangerouslySetInnerHtml: generated locally by posterSvg
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={() => void downloadPng(svg, size)}>
            {t("downloadPng")}
          </Button>
          <Button type="button" variant="outline" className="h-11" onClick={() => printPdf(svg, size)}>
            {t("downloadPdf")}
          </Button>
        </div>
      </div>
    </section>
  );
}

/** SVG → canvas (150 dpi) → PNG download */
async function downloadPng(svg: string, size: PaperSize): Promise<void> {
  const { w, h } = PAPER[size];
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * PX_PER_MM);
  canvas.height = Math.round(h * PX_PER_MM);
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `qr-poster-${size}.png`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** PDF through the browser's print dialog (save as PDF) at the chosen paper size — no PDF library */
function printPdf(svg: string, size: PaperSize): void {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>QR ${size}</title><style>@page{size:${size};margin:0}html,body{margin:0}svg{display:block;width:100vw;height:100vh}</style></head><body>${svg}</body></html>`,
  );
  win.document.close();
  win.focus();
  win.print();
}
