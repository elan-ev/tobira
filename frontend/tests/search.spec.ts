import { test, expect } from "@playwright/test";
import { navigateTo } from "./common";


test("Search", async ({ page }) => {
    await navigateTo("/", page);
    await page.waitForSelector("nav");
    const searchField = page.getByPlaceholder("Search");
    const query = "video";

    await test.step("Should be focusable by keyboard shortcut", async () => {
        await page.keyboard.press("s");
        await expect(searchField).toBeFocused();
    });

    await test.step("Should allow search queries to be executed", async () => {
        const url = `~search?q=${query}`;
        await searchField.fill(query);

        await expect(page).toHaveURL(url);
    });

    await test.step("Should show search results", async () => {
        await expect(page.getByText("Search results")).toBeVisible();
        const results = page
            .locator("li")
            .filter({ hasText: "video" })
            .locator("a");
        await results.nth(1).waitFor();
        expect(await results.count()).toBeGreaterThan(0);
    });
});
