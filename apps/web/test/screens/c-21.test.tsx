import type { ReportCardDetail } from "@app/contracts/dto/report-card-detail";
import { ReportCardsUpdateRequest } from "@app/contracts/endpoints/reportCards.update";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findings, ReportCardItem, ReportCardsScreen, textsBody } from "../../src/components/c-21/report-cards-screen";
import messages from "../../src/i18n/messages/th/C-21.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), data: undefined as unknown }));
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => String((namespace === "common" ? common : messages)[key as never]),
}));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: unknown) => {
    mock.query(key, input);
    return { data: mock.data, isPending: false, isError: false, error: null, refetch: vi.fn() };
  },
  useApiMutation: (key: string, options: unknown) => {
    mock.mutation(key, options);
    return { mutateAsync: vi.fn(), isPending: false };
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  mock.data = undefined;
});

const t = ((key: string) => String(messages[key as never])) as never;
const card = (over: Partial<ReportCardDetail> = {}) =>
  ({
    id: "00000000-0000-4000-8000-000000000001",
    status: "pending_review",
    pet: { name: "โมจิ" },
    groomerName: "พี่ดาว",
    skin: "normal",
    ears: null,
    nails: null,
    teeth: null,
    parasites: "none",
    staffNote: "น้องเรียบร้อยดี",
    recommendation: null,
    afterPhotos: [{ url: "https://s.test/after.jpg", caption: null }],
    beforePhotos: [],
    ...over,
  }) as unknown as ReportCardDetail;

describe("logic", () => {
  it("text body (blank clears, limits) and findings in 06 order", () => {
    expect(ReportCardsUpdateRequest.parse(textsBody(" ดี ", " "))).toEqual({ staffNote: "ดี", recommendation: null });
    expect(textsBody("ก".repeat(501), "")).toBeNull();
    expect(textsBody("", "ก".repeat(301))).toBeNull();
    expect(findings(card()).map((f) => f.key)).toEqual(["skin", "parasites"]);
  });
});

describe("ReportCardItem", () => {
  it("after photo, pet, groomer, finding tags, editable texts, save and send for pending_review", () => {
    const html = renderToStaticMarkup(<ReportCardItem t={t} card={card()} busy={false} onSave={vi.fn()} onSend={vi.fn()} />);
    for (const text of [
      "https://s.test/after.jpg",
      messages.pet,
      "โมจิ",
      messages.groomer,
      "พี่ดาว",
      messages.findings,
      messages.skin,
      messages.parasites,
      messages.staffNote,
      "น้องเรียบร้อยดี",
      messages.recommendation,
      messages.save,
      messages.send,
      'maxLength="500"',
    ])
      expect(html, text).toContain(text);
    expect(
      renderToStaticMarkup(<ReportCardItem t={t} card={card({ status: "sent" })} busy={false} onSave={vi.fn()} onSend={vi.fn()} />),
    ).not.toContain(messages.send);
  });
});

describe("ReportCardsScreen", () => {
  it("loads pending_review cards and wires reportCards.update / approve", () => {
    mock.data = [card()];
    expect(renderToStaticMarkup(<ReportCardsScreen />)).toContain(messages.title);
    expect(mock.query).toHaveBeenCalledWith("reportCards.list", expect.objectContaining({ query: { status: "pending_review" } }));
    expect(mock.mutation.mock.calls.map((c) => c[0])).toEqual(["reportCards.update", "reportCards.approve"]);
    mock.data = [];
    expect(renderToStaticMarkup(<ReportCardsScreen />)).toContain(messages.empty);
  });
});
