import { test } from "./common";
import { expect } from "@playwright/test";


test("Empty Tobira", async ({ page }) => {
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

        await page.getByLabel("User ID").fill("admin");
        await page.getByLabel("Password").fill("tobira");
        await page.keyboard.press("Enter");

        // TODO
        // await expect(page).toHaveURL(baseURL as string);
        // await expect(page.getByRole("button", { name: "Administrator" })).toBeVisible();
    });
});

test("TMP", async ({ page, standardData }) => {
    await page.goto("/");
    await expect(page.locator("main")).toContainText("Henlo good fren");
});
