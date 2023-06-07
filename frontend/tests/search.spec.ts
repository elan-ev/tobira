import { test, expect } from "@playwright/test";
import { navigateTo } from "./common";


test("Search", async ({ page }) => {
    await navigateTo("/", page);
    await page.waitForSelector("nav");
    const searchField = page.locator("_react=SearchField").locator("input");

    await test.step("Should be focusable by keyboard shortcut", async () => {
        await page.keyboard.press("s");
        await expect(searchField).toBeFocused();
    });

    await test.step("Should allow search queries to be executed", async () => {
        const url = "~search?q=Video";
        await searchField.fill("Video");

        await expect(page).toHaveURL(url);
    });

    await test.step("Should show search results", async () => {
        const results = page.locator("_react=SearchResults");
        await expect(results).toBeVisible();
        expect(await results.getByRole("link").count()).toBeGreaterThan(0);
    });
});