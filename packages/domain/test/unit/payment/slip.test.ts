import { describe, expect, it } from "vitest";
import { findDuplicateSlip, parseSlipQr } from "../../../src/payment/slip.ts";

const KBANK = "0041000600000101030040220014242082547BPM049885102TH910434DF";

describe("parseSlipQr (extra cases beyond the vectors)", () => {
  it("ignores surrounding whitespace and accepts a lower-case CRC", () => {
    expect(parseSlipQr({ payload: `  ${KBANK}\n` })).toMatchObject({ crcValid: true });
    expect(parseSlipQr({ payload: KBANK.replace(/34DF$/, "34df") })).toMatchObject({ crcValid: true });
  });

  it("returns a null bank code when tag 01 is missing", () => {
    const sub = "0006000001" + "0205REF01";
    const body = `00${sub.length}${sub}5102TH9104`;
    expect(parseSlipQr({ payload: `${body}0000` })).toEqual({ bankCode: null, transRef: "REF01", crcValid: false });
  });

  it("returns null for truncated TLV or a missing transaction reference", () => {
    expect(parseSlipQr({ payload: KBANK.slice(0, -10) })).toBeNull();
    expect(parseSlipQr({ payload: "00140006000001010300491040000" })).toBeNull();
    expect(parseSlipQr({ payload: "" })).toBeNull();
  });
});

describe("findDuplicateSlip (extra cases beyond the vectors)", () => {
  it("skips rejected slips and returns the earliest remaining match", () => {
    const existing = [
      { id: "a", transRef: "R", status: "rejected" as const, createdAt: "2026-10-01T00:00:00.000Z" },
      { id: "b", transRef: "R", status: "submitted" as const, createdAt: "2026-10-03T00:00:00.000Z" },
      { id: "c", transRef: "R", status: "verified" as const, createdAt: "2026-10-02T00:00:00.000Z" },
      { id: "d", transRef: "OTHER", status: "verified" as const, createdAt: "2026-09-01T00:00:00.000Z" },
    ];
    expect(findDuplicateSlip({ transRef: "R", existing })).toEqual({ duplicateOfSlipId: "c" });
  });

  it("treats an empty reference like no QR", () => {
    expect(
      findDuplicateSlip({ transRef: "", existing: [{ id: "a", transRef: "", status: "verified", createdAt: "2026-10-01T00:00:00.000Z" }] }),
    ).toEqual({
      duplicateOfSlipId: null,
    });
  });
});
