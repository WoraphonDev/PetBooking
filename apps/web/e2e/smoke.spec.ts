import { expect, test } from "@playwright/test";

test("A-01 login page shows the sign-in form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "เข้าสู่ระบบ (ร้าน)" })).toBeVisible();
  await expect(page.getByLabel("อีเมล")).toBeVisible();
  await expect(page.getByLabel("รหัสผ่าน", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "เข้าสู่ระบบ" })).toBeVisible();
});
