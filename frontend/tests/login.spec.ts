import { test, expect } from "@playwright/test";
import { navigateTo } from "./common";

test("Login", async ({ page, baseURL }) => {
    await navigateTo("/", page);

    await page.getByRole("link", { name: "Login" }).click();
    await expect(page).toHaveURL("~login");

    await page.getByLabel("User ID").fill("admin");
    await page.getByLabel("Password").fill("tobira");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(baseURL as string);
    await expect(page.getByRole("button", { name: "Administrator" })).toBeVisible();
});
