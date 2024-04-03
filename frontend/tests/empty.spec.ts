import { test } from "./util/data";
import { expect } from "@playwright/test";
import { USERS } from "./util/user";


test("Empty Tobira", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "Skip safari because it doesn't allow http logins");

    await page.goto("/");

    await test.step("Looks empty", async () => {
        await expect(page.locator("h1").nth(0)).toContainText("Tobira Videoportal");
        await expect(page.locator("main").nth(0)).toContainText("No pages yet");
        expect(await page.isVisible("text='Login'")).toBe(true);
    });

    await test.step("About page", async () => {
        await page.getByText("About Tobira").click();
        await expect(page).toHaveURL("~tobira");
        await expect(page.locator("h2")).toContainText("Version");
    });

    await test.step("Login works", async () => {
        await page.getByRole("link", { name: "Login" }).click();
        await expect(page).toHaveURL("~login");

        await page.getByLabel("User ID").fill("sabine");
        await page.getByLabel("Password").fill("tobira");
        await page.keyboard.press("Enter");

        await expect(page).toHaveURL("~tobira");
        await expect(page.getByRole("button", { name: USERS.sabine })).toBeVisible();
    });
});
