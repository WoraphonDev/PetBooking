import { BranchSetPromptpayRequest } from "@app/contracts/endpoints/branch.setPromptpay";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formFrom, promptpayBody, testPayload } from "../../src/components/c-34/logic";
import { AccountForm, PaymentScreen } from "../../src/components/c-34/payment-screen";
import messages from "../../src/i18n/messages/th/C-34.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), data: {} as Record<string, unknown> }));
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    const text = String((namespace === "common" ? common : messages)[key as never]);
    return Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), text);
  },
}));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: unknown) => {
    mock.query(key, input);
    return { data: mock.data[key], isPending: false, isError: false, error: null, refetch: vi.fn() };
  },
  useApiMutation: (key: string, options: unknown) => {
    mock.mutation(key, options);
    return { mutateAsync: vi.fn(), isPending: false };
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  mock.data = {};
});

const t = ((key: string, values?: Record<string, unknown>) =>
  Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), String(messages[key as never]))) as never;
const current = { type: "phone" as const, idMasked: "08x-xxx-5678", accountName: "ร้านน้องหมา" };

describe("logic", () => {
  it("never prefills the full id; R-30 checks the typed id and the test QR is ฿1", () => {
    expect(formFrom(current)).toEqual({ type: "phone", id: "", accountName: "ร้านน้องหมา", password: "" });
    expect(testPayload({ type: "phone", id: "" })).toBeNull();
    expect(testPayload({ type: "phone", id: "12345" })).toBeNull();
    const payload = testPayload({ type: "phone", id: "081-234-5678" });
    expect(payload).toContain("0066812345678");
    expect(payload).toContain("54041.00");
  });

  it("requires type, a valid id, account name and the password; sends digits only", () => {
    expect(promptpayBody({ type: null, id: "", accountName: " ", password: "" }).errors).toEqual({
      type: true,
      id: true,
      accountName: true,
      password: true,
    });
    const { body } = promptpayBody({ type: "national_id", id: "1-1037-02071-83-4", accountName: " ร้าน ", password: "secret" });
    expect(BranchSetPromptpayRequest.parse(body)).toEqual({
      type: "national_id",
      id: "1103702071834",
      accountName: "ร้าน",
      password: "secret",
    });
  });
});

describe("AccountForm", () => {
  it("shows ประเภท radios, the masked id, ชื่อบัญชี, รหัสผ่าน and the QR placeholder", () => {
    const html = renderToStaticMarkup(<AccountForm t={t} current={current} busy={false} onSave={vi.fn()} />);
    for (const text of [
      messages.type,
      "เบอร์มือถือ",
      "เลขบัตรประชาชน",
      "เลขผู้เสียภาษี",
      "e-Wallet",
      messages.id,
      "บัญชีปัจจุบัน 08x-xxx-5678",
      messages.accountName,
      'value="ร้านน้องหมา"',
      messages.password,
      'type="password"',
      messages.testQr,
      messages.testQrEmpty,
      messages.save,
    ])
      expect(html, text).toContain(text);
    expect(
      renderToStaticMarkup(<AccountForm t={t} current={{ type: null, idMasked: null, accountName: null }} busy={false} onSave={vi.fn()} />),
    ).toContain(messages.notSet);
  });
});

describe("PaymentScreen", () => {
  it("loads branch.get and wires branch.setPromptpay", () => {
    mock.data = { "branch.get": { promptpay: current } };
    expect(renderToStaticMarkup(<PaymentScreen />)).toContain(messages.title);
    expect(mock.query.mock.calls.map((c) => c[0])).toEqual(["branch.get"]);
    expect(mock.mutation.mock.calls[0]).toEqual(["branch.setPromptpay", expect.objectContaining({ invalidate: ["branch.get"] })]);
  });
});
