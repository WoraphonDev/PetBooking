import { readFileSync } from "node:fs";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STATUS_TONES, StatusBadge, type StatusTone, statusTone, TONE_CLASS } from "../../../src/components/shared/table/index.ts";
import enumLabels from "../../../src/i18n/messages/th/enum.json";

// ADR-006 §3 enum × tone table, parsed from the decision record itself
const adr = readFileSync(new URL("../../../../../docs/decisions/ADR-006-visual-theme.md", import.meta.url), "utf8");
const lines = adr.split("\n");
const headerIndex = lines.findIndex((line) => line.startsWith("| enum |"));
const header = lines[headerIndex] ?? "";
const toneColumns = header
  .split("|")
  .slice(2, -1)
  .map((c) => c.trim()) as StatusTone[];
const adrRows = lines
  .slice(headerIndex + 2)
  .filter((line) => /^\| `\w+` \|/.test(line))
  .map((line) => {
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    const enumName = (cells[0] ?? "").replaceAll("`", "");
    const tones: Record<string, StatusTone> = {};
    cells.slice(1).forEach((cell, i) => {
      for (const value of cell
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean))
        tones[value] = toneColumns[i] as StatusTone;
    });
    return [enumName, tones] as const;
  });

describe("StatusBadge tones (ADR-006 §3)", () => {
  it("matches the ADR table exactly", () => {
    expect(toneColumns).toEqual(["info", "progress", "success", "attention", "danger", "neutral"]);
    expect(adrRows.length).toBe(17);
    expect(Object.fromEntries(adrRows)).toEqual(STATUS_TONES);
  });

  it("only uses enum values that have a Thai label", () => {
    const labels: Record<string, Record<string, string>> = enumLabels;
    for (const [enumName, tones] of Object.entries(STATUS_TONES)) {
      for (const value of Object.keys(tones)) expect(labels[enumName]?.[value], `${enumName}.${value}`).toBeTruthy();
    }
  });

  it("falls back to neutral for an unlisted value", () => {
    expect(statusTone("org_status", "unknown")).toBe("neutral");
  });

  it("renders the Thai label with the tone's background/text pair", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="th" messages={{}}>
        <StatusBadge enumName="booking_status" value="awaiting_deposit" />
        <StatusBadge enumName="org_status" value="suspended" />
      </NextIntlClientProvider>,
    );
    expect(html).toContain(`data-tone="attention"`);
    expect(html).toContain(TONE_CLASS.attention);
    expect(html).toContain(enumLabels.booking_status.awaiting_deposit);
    expect(html).toContain(`data-tone="danger"`);
    expect(html).toContain(TONE_CLASS.danger);
    expect(html).toContain(enumLabels.org_status.suspended);
  });
});
