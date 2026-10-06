// T-0010: TEMPLATES / stub templates ⇄ docs/spec/07-notifications-jobs.md §1.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type NotificationPayloads, TEMPLATES, type TemplateKey } from "../../src/notify/keys.ts";
import { renderTemplate } from "../../src/notify/templates/index.ts";

const md = readFileSync(new URL("../../../../docs/spec/07-notifications-jobs.md", import.meta.url), "utf8");
// only the template table: §1 ends at its first subsection (### 1.x has other tables starting with `| \`key\``) or at §2
const start = md.indexOf("## 1. Templates");
const ends = [md.indexOf("\n### ", start), md.indexOf("\n## 2.", start)].filter((i) => i !== -1);
const section = md.slice(start, Math.min(...ends));
const rows = section
  .split("\n")
  .filter((l) => l.startsWith("| `"))
  .map((l) => {
    const [key, recipients, channels, cls, economy, , , vars, text] = l
      .trim()
      .slice(1, -1)
      .split(" | ")
      .map((c) => c.trim());
    return {
      key: (key ?? "").replaceAll("`", ""),
      recipients,
      channels: (channels ?? "").split("|"),
      messageClass: cls === "-" ? null : cls,
      economy: economy === "-" ? null : economy,
      vars: (vars ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
      text: (text ?? "").replaceAll("<br>", "\n").replaceAll("\\|", "|"),
    };
  });

describe("TEMPLATES ⇄ 07 §1", () => {
  it("has exactly the 39 keys in 07 order", () => {
    expect(rows).toHaveLength(39);
    expect(Object.keys(TEMPLATES)).toEqual(rows.map((r) => r.key));
  });

  it.each(rows)("$key: recipients, channels, class, economy, vars", (r) => {
    const { recipients, channels, messageClass, economy, vars } = TEMPLATES[r.key as TemplateKey];
    expect({ recipients, channels, messageClass, economy, vars }).toEqual({
      recipients: r.recipients,
      channels: r.channels,
      messageClass: r.messageClass,
      economy: r.economy,
      vars: r.vars,
    });
  });

  it.each(rows)("$key: stub renders the 07 text with variables substituted", (r) => {
    const payload = Object.fromEntries(r.vars.map((v) => [v, `<${v}>`]));
    const expected = r.text.replace(/\{(\w+)\}/g, (_m, v: string) => (r.vars.includes(v) ? `<${v}>` : ""));
    const { text } = renderTemplate(r.key as TemplateKey, payload as NotificationPayloads[TemplateKey]);
    expect(text).toBe(expected);
    expect(text).not.toMatch(/\{\w+\}/);
  });

  it("placeholders outside the variable list render empty (Q-0010)", () => {
    const { text } = renderTemplate("customer.ready_for_pickup", { petName: "โมจิ", reportCardUrl: "u", balance: "฿0" });
    expect(text).toBe("โมจิอาบน้ำตัดขนเสร็จแล้ว มารับได้เลยค่ะ ✨\n\nยอดชำระ ฿0");
  });
});
