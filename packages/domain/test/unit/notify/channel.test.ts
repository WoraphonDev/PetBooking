// R-19 edge cases beyond docs/spec/vectors/R-19.selectChannel.json (vectors run in test/vectors.test.ts).
import { describe, expect, it } from "vitest";
import { selectChannel } from "../../../src/notify/channel.ts";

type Input = Parameters<typeof selectChannel>[0];
const customer: Input = {
  recipientType: "customer",
  hasLineIdentity: true,
  isFriend: true,
  templateAllowsReply: true,
  replyTokenAgeSeconds: null,
  activePushSubscriptions: 0,
  isOwner: false,
  hasEmail: false,
};
const staff: Input = { ...customer, recipientType: "staff" };

const SKIP = { channel: null, skipReason: "no_recipient" };

describe("selectChannel — customer", () => {
  it("no line_identity → no_recipient even with a fresh reply token", () => {
    expect(selectChannel({ ...customer, hasLineIdentity: false, replyTokenAgeSeconds: 1 })).toEqual(SKIP);
  });

  it("reply token boundary: < 50 s replies, 50 s pushes", () => {
    expect(selectChannel({ ...customer, replyTokenAgeSeconds: 0 })).toEqual({ channel: "line_reply", skipReason: null });
    expect(selectChannel({ ...customer, replyTokenAgeSeconds: 49 })).toEqual({ channel: "line_reply", skipReason: null });
    expect(selectChannel({ ...customer, replyTokenAgeSeconds: 50 })).toEqual({ channel: "line_push", skipReason: null });
  });

  it("template that doesn't allow reply → push even with a fresh token", () => {
    expect(selectChannel({ ...customer, templateAllowsReply: false, replyTokenAgeSeconds: 5 })).toEqual({
      channel: "line_push",
      skipReason: null,
    });
  });

  it("staff devices/email don't matter for customers", () => {
    expect(selectChannel({ ...customer, isFriend: false, activePushSubscriptions: 3, isOwner: true, hasEmail: true })).toEqual(SKIP);
  });
});

describe("selectChannel — staff", () => {
  it("LINE fields don't matter for staff", () => {
    expect(
      selectChannel({ ...staff, hasLineIdentity: false, isFriend: false, replyTokenAgeSeconds: 1, activePushSubscriptions: 1 }),
    ).toEqual({
      channel: "web_push",
      skipReason: null,
    });
  });

  it("owner with a device gets web_push, not email", () => {
    expect(selectChannel({ ...staff, activePushSubscriptions: 1, isOwner: true, hasEmail: true })).toEqual({
      channel: "web_push",
      skipReason: null,
    });
  });

  it("email fallback is owner-only and needs an email", () => {
    expect(selectChannel({ ...staff, isOwner: false, hasEmail: true })).toEqual(SKIP);
    expect(selectChannel({ ...staff, isOwner: true, hasEmail: false })).toEqual(SKIP);
  });
});
