import { expect } from "@playwright/test";
import { test, navigateTo } from "./util/common";


test("Search", async ({ page, standardData, activeSearchIndex }) => {
    await navigateTo("/", page);
    await page.waitForSelector("nav");
    const searchField = page.getByPlaceholder("Search");
    const query = "cat";

    await test.step("Should be focusable by keyboard shortcut", async () => {
        await page.keyboard.press("s");
        await expect(searchField).toBeFocused();
    });

    await test.step("Should allow search queries to be executed", async () => {
        await searchField.fill(query);
        await expect(page).toHaveURL(`~search?q=${query}`);
    });

    await test.step("Should show breadcrumbs", async () => {
        await expect(page.getByText("Search results for “cat” (4 hits)")).toBeVisible();
    });

    for (const videoTitle of ["Video of a Tabby Cat", "Dual Stream Cats"]) {
        await test.step(`Should show video '${videoTitle}'`, async () => {
            await expect(page.getByRole("img", { name: `Thumbnail for “${videoTitle}”` }))
                .toBeVisible();
            const title = page.getByRole("heading", { name: videoTitle });
            // We need `force` to allow clicking the overlay.
            await title.click({ force: true });
            expect(page.url().startsWith("/!v/"));
            await page.goBack();
        });
    }

    await test.step("Series links should work", async () => {
        const eventSeriesLink = page.getByRole("link", { name: "Fabulous Cats" });
        await expect(eventSeriesLink).toHaveCount(2);
        await eventSeriesLink.first().click();
        expect(page.url().startsWith("/!s/"));
        await page.goBack();
    });

    await test.step("Should show realm 'Cats'", async () => {
        const realm = page.getByRole("heading", { name: "Cats", exact: true });
        await expect(realm).toBeVisible();
        await realm.click({ force: true });
        await expect(page).toHaveURL("/animals/cats");
        await page.goBack();
    });

    await test.step("Should show realm 'Fabulous Cats'", async () => {
        const realm = page.getByRole("heading", { name: "Fabulous Cats" });
        await expect(realm).toBeVisible();
        await realm.click({ force: true });
        await expect(page).toHaveURL("/love");
        await page.goBack();
    });
});

// TODO:
// - login and see protected videos
// - search for video only included in one page & having correct link
