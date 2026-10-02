import { AdminCreateOrgRequest } from "@app/contracts/endpoints/admin.createOrg";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  EnumSelect,
  FormField,
  fromLocalDateString,
  MoneyInput,
  monthCaption,
  PhoneInput,
  ThaiDatePicker,
  TimeSelect,
  timeLabel,
  timeOptions,
  toLocalDateString,
  validateForm,
  WeightInput,
} from "../../../src/components/shared/form/index.ts";
import enumLabels from "../../../src/i18n/messages/th/enum.json";

const noop = () => {};

describe("unit inputs", () => {
  it("MoneyInput shows baht with inputmode=decimal", () => {
    const html = renderToStaticMarkup(<MoneyInput value={123450} onValueChange={noop} />);
    expect(html).toMatch(/<input[^>]*type="text"[^>]*inputMode="decimal"[^>]*value="1234.50"/);
    expect(html).toContain("฿");
  });

  it("WeightInput shows kg with the R-31 unit", () => {
    const html = renderToStaticMarkup(<WeightInput value={4500} onValueChange={noop} />);
    expect(html).toMatch(/<input[^>]*inputMode="decimal"[^>]*value="4.5"/);
    expect(html).toContain("กก.");
  });

  it("PhoneInput uses type=tel / inputmode=tel and shows the stored E.164 in R-22 display form", () => {
    const html = renderToStaticMarkup(<PhoneInput value="+66812345678" onValueChange={noop} />);
    expect(html).toMatch(/<input[^>]*type="tel"[^>]*inputMode="tel"[^>]*value="081-234-5678"/);
  });
});

describe("TimeSelect", () => {
  it("lists local times by step with R-31 labels", () => {
    expect(timeOptions("09:00", "10:00", 15)).toEqual(["09:00", "09:15", "09:30", "09:45", "10:00"]);
    expect(timeOptions().length).toBe(96);
    expect(timeLabel("14:30")).toBe("14:30 น.");
    const html = renderToStaticMarkup(<TimeSelect value="09:30" onValueChange={noop} from="09:00" to="10:00" stepMinutes={30} />);
    expect(html).toContain('<option value="09:30" selected="">09:30 น.</option>');
    expect(html.match(/<option/g)).toHaveLength(3);
  });
});

describe("EnumSelect", () => {
  it("labels every enum value via enumLabel, or only the given subset", () => {
    const all = renderToStaticMarkup(<EnumSelect enumName="staff_role" value={null} onValueChange={noop} placeholder="เลือก" />);
    for (const [value, label] of Object.entries(enumLabels.staff_role)) expect(all).toContain(`<option value="${value}">${label}</option>`);
    const some = renderToStaticMarkup(<EnumSelect enumName="species" values={["cat"]} value="cat" onValueChange={noop} />);
    expect(some).toBe(
      `<select class="${some.match(/class="([^"]*)"/)?.[1]}"><option value="cat" selected="">${enumLabels.species.cat}</option></select>`,
    );
  });
});

describe("ThaiDatePicker", () => {
  it("shows the chosen local date in Thai B.E. and the placeholder when empty", () => {
    expect(renderToStaticMarkup(<ThaiDatePicker value="2026-10-05" onValueChange={noop} placeholder="เลือกวันที่" />)).toContain("5 ต.ค. 2569");
    expect(renderToStaticMarkup(<ThaiDatePicker value={null} onValueChange={noop} placeholder="เลือกวันที่" />)).toContain("เลือกวันที่");
  });

  it("converts calendar days to YYYY-MM-DD without time-zone shifts and captions months in B.E.", () => {
    expect(toLocalDateString(fromLocalDateString("2026-12-31"))).toBe("2026-12-31");
    expect(toLocalDateString(new Date(2027, 0, 1))).toBe("2027-01-01");
    expect(monthCaption(new Date(2026, 9, 20))).toBe("ต.ค. 2569");
  });
});

describe("zod form helper", () => {
  const values = {
    name: "Happy Paws",
    slug: "Bad Slug",
    branchName: "",
    bookingSlug: "happy-paws",
    ownerEmail: "owner@shop.test",
    ownerName: "เจ้าของ",
    modules: { grooming: true, hotel: "no", daycare: false },
  };

  it("returns the first Thai message per field path using the API contract schema", () => {
    const result = validateForm(AdminCreateOrgRequest, values);
    expect(result.success).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(["branchName", "modules.hotel", "slug"]);
    for (const message of Object.values(result.errors)) expect(message).toMatch(/[฀-๿]/);
  });

  it("returns parsed data (with contract transforms) when valid", () => {
    const result = validateForm(AdminCreateOrgRequest, {
      ...values,
      slug: "happy-paws",
      branchName: "สาขาหลัก",
      ownerEmail: " Owner@Shop.TEST ",
      modules: { grooming: true, hotel: false, daycare: false },
    });
    expect(result).toMatchObject({ success: true, errors: {}, data: { ownerEmail: "owner@shop.test" } });
  });

  it("FormField renders the label and the error under the control", () => {
    const html = renderToStaticMarkup(
      <FormField id="f-name" label="ชื่อร้าน" error="ต้องกรอก">
        <input id="f-name" />
      </FormField>,
    );
    expect(html).toMatch(
      /<label[^>]*for="f-name"[^>]*>ชื่อร้าน<\/label><input id="f-name"\/><p id="f-name-error" role="alert"[^>]*>ต้องกรอก<\/p>/,
    );
  });
});
