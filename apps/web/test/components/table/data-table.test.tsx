import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  currentCursor,
  DataTable,
  type DataTableProps,
  EmptyState,
  initialCursorState,
  nextPage,
  pageIndex,
  previousPage,
} from "../../../src/components/shared/table/index.ts";
import common from "../../../src/i18n/messages/th/common.json";

type Row = { id: string; name: string };
const columns = [
  { id: "name", header: "ชื่อร้าน", cell: (r: Row) => r.name },
  { id: "id", header: "รหัส", cell: (r: Row) => r.id },
];
const wrap = (node: ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ common }}>
      {node}
    </NextIntlClientProvider>,
  );
const table = (props: Partial<DataTableProps<Row>>) => wrap(<DataTable<Row> columns={columns} rows={[]} rowKey={(r) => r.id} {...props} />);

describe("DataTable", () => {
  it("renders headers and one row per item", () => {
    const html = table({
      rows: [
        { id: "r1", name: "Happy Paws" },
        { id: "r2", name: "Fluffy" },
      ],
    });
    expect(html).toContain("ชื่อร้าน");
    expect(html).toContain("รหัส");
    expect(html.match(/data-slot="table-row"/g)).toHaveLength(3);
    expect(html).toContain("Happy Paws");
    expect(html).toContain("Fluffy");
  });

  it("shows skeleton rows while loading", () => {
    const html = table({ rows: undefined, skeletonRows: 3 });
    expect(html.match(/aria-busy="true"/g)).toHaveLength(3);
    expect(html).toContain('data-slot="skeleton"');
  });

  it("shows the API error message with a retry button instead of the table", () => {
    const html = table({ error: "ข้อมูลไม่ถูกต้อง", onRetry: () => {} });
    expect(html).toMatch(/role="alert"[^>]*>.*ข้อมูลไม่ถูกต้อง.*ลองใหม่/);
    expect(html).not.toContain('data-slot="table"');
  });

  it("shows the empty state with the main action, defaulting to the common empty message", () => {
    expect(table({ rows: [] })).toContain(common.empty);
    const html = table({ rows: [], empty: { message: "ยังไม่มีร้าน", action: { label: "สร้างร้าน", href: "/admin/organizations" } } });
    expect(html).toContain("ยังไม่มีร้าน");
    expect(html).toMatch(/<a[^>]*href="\/admin\/organizations"[^>]*>สร้างร้าน<\/a>/);
  });

  it("renders the search box and filter slot", () => {
    const html = table({ search: { value: "paws", onChange: () => {} }, filters: <select aria-label="สถานะ" /> });
    expect(html).toMatch(/<input[^>]*type="search"[^>]*aria-label="ค้นหา"[^>]*value="paws"/);
    expect(html).toContain('aria-label="สถานะ"');
  });

  it("shows back/next controls for cursor pagination, disabled at the ends", () => {
    const pager = { onNext: () => {}, onPrevious: () => {} };
    expect(table({ pagination: { ...pager, nextCursor: null, hasPrevious: false } })).not.toContain(common.next);
    const first = table({ pagination: { ...pager, nextCursor: "c2", hasPrevious: false } });
    expect(first).toMatch(/<button[^>]*disabled=""[^>]*>.*ย้อนกลับ/);
    expect(first).not.toMatch(/<button[^>]*disabled=""[^>]*>ถัดไป/);
    const last = table({ pagination: { ...pager, nextCursor: null, hasPrevious: true } });
    expect(last).toMatch(/<button[^>]*disabled=""[^>]*>ถัดไป/);
  });
});

describe("cursor pagination state", () => {
  it("walks forward with nextCursor and back through visited cursors", () => {
    let s = initialCursorState;
    expect([currentCursor(s), pageIndex(s)]).toEqual([null, 0]);
    s = nextPage(s, "c2");
    s = nextPage(s, "c3");
    expect([currentCursor(s), pageIndex(s)]).toEqual(["c3", 2]);
    expect(nextPage(s, null)).toBe(s);
    s = previousPage(s);
    expect(currentCursor(s)).toBe("c2");
    s = previousPage(previousPage(s));
    expect([currentCursor(s), pageIndex(s)]).toEqual([null, 0]);
  });
});

describe("EmptyState", () => {
  it("renders a button action", () => {
    expect(wrap(<EmptyState message="ไม่มีรายการ" action={{ label: "เพิ่ม", onClick: () => {} }} />)).toMatch(
      /ไม่มีรายการ.*<button[^>]*type="button"[^>]*>เพิ่ม<\/button>/,
    );
  });
});
