import { describe, expect, it } from "vitest";
import { createFakeStorage, decodeUtf8 } from "../../src/integrations/storage/index.ts";

describe("ObjectStorage.getText (Q-1007)", () => {
  it("returns the body as text, drops a UTF-8 BOM, and null for a missing key", async () => {
    const storage = createFakeStorage();
    storage.put("a.csv", { sizeBytes: 9, contentType: "text/csv" }, "﻿ชื่อ,x");
    expect(await storage.getText("a.csv")).toBe("ชื่อ,x");
    expect(await storage.getText("missing.csv")).toBeNull();
    await storage.delete("a.csv");
    expect(await storage.getText("a.csv")).toBeNull();
  });

  it("refuses bytes that are not UTF-8", async () => {
    const storage = createFakeStorage();
    storage.put("b.csv", { sizeBytes: 2, contentType: "text/csv" }, new Uint8Array([0xe9, 0xff]));
    await expect(storage.getText("b.csv")).rejects.toThrow("INVALID_UTF8");
    expect(() => decodeUtf8(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]))).not.toThrow();
  });
});
