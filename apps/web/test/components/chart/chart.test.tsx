import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BarChart, formatChartValue, LineChart } from "../../../src/components/shared/chart/index.ts";
import common from "../../../src/i18n/messages/th/common.json";

describe("report charts", () => {
  it("formats server values using R-31 without treating satang as baht", () => {
    expect(formatChartValue(123450, "money")).toBe("฿1,234.50");
    expect(formatChartValue(-50000, "money")).toBe("-฿500");
    expect(formatChartValue(4550, "weight")).toBe("4.6 กก.");
    expect(formatChartValue(12, "number")).toBe("12");
  });

  it("rejects nonfinite chart values and fractional base units", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => formatChartValue(value, "number")).toThrow(RangeError);
    }
    expect(() => formatChartValue(1.5, "money")).toThrow(RangeError);
    expect(() => formatChartValue(1.5, "weight")).toThrow(RangeError);
  });

  for (const Chart of [BarChart, LineChart]) {
    it(`${Chart.name} keeps labels and exact formatted values accessible before measurement`, () => {
      const data = [
        { label: "5 ต.ค. 2569", value: 123450 },
        { label: "6 ต.ค. 2569", value: 0 },
      ];
      const html = renderToStaticMarkup(<Chart label="ยอดขาย" data={data} unit="money" />);
      expect(html).toContain('aria-label="ยอดขาย"');
      expect(html).toContain("5 ต.ค. 2569");
      expect(html).toContain("฿1,234.50");
      expect(html).toContain("฿0");
      expect(data[0]?.value).toBe(123450);
    });

    it(`${Chart.name} shows the shared empty state`, () => {
      const html = renderToStaticMarkup(
        <NextIntlClientProvider locale="th" messages={{ common }}>
          <Chart label="น้ำหนัก" data={[]} unit="weight" />
        </NextIntlClientProvider>,
      );
      expect(html).toContain(common.empty);
      expect(html).not.toContain("recharts");
    });
  }
});
