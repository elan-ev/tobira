import { expect } from "@playwright/test";
import { test } from "./util/common";
import { logout } from "./util/user";

test("Login", async ({ page, baseURL, browserName }) => {
    test.skip(browserName === "webkit", "Skip safari because it doesn't allow http logins");

    await page.goto("/");

    await page.getByRole("link", { name: "Login" }).click();
    await expect(page).toHaveURL("~login");

    await page.getByLabel("User ID").fill("admin");
    await page.getByLabel("Password").fill("tobira");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(baseURL as string);
    await expect(page.getByRole("button", { name: "Administrator" })).toBeVisible();

    await test.step("Logout again", async () => {
        await logout(page, "admin");
    });
});
