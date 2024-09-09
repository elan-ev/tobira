import { Page, expect } from "@playwright/test";
import { test } from "./util/data";
import { login, logout } from "./util/user";


test("Search", async ({ page, standardData, activeSearchIndex }) => {
    await page.goto("/");
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
        await expect(page.getByText("Search results for cat (6 hits)")).toBeVisible();
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
        await expect(eventSeriesLink).toHaveCount(3);
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
        const realm = page.getByRole("heading", { name: "Fabulous Cats" }).nth(1);
        await expect(realm).toBeVisible();
        await realm.click({ force: true });
        await expect(page).toHaveURL("/love");
        await page.goBack();
    });
});

const startSearch = async (page: Page, query: string, startUrl?: string) => {
    if (startUrl) {
        await page.goto(startUrl);
    }
    const searchField = page.getByPlaceholder("Search");
    await searchField.click();
    await searchField.fill(query);
    await expect(page).toHaveURL(`~search?${new URLSearchParams({ q: query })}`);
};

const expectNoResults = async (page: Page, query: string) => {
    await expect(page.getByText(`Search results for ${query} (0 hits)`)).toBeVisible();
    await expect(page.getByText("No results")).toBeVisible();
    await expect(page.getByRole("img", { name: "Thumbnail" })).toBeHidden();
};

test("Cannot find unlisted items in main search", async ({
    page, standardData, activeSearchIndex,
}) => {
    const query = "unlisted";
    await startSearch(page, query, "/love/kiwi");
    await expectNoResults(page, query);
});

test("Read access is checked", async ({ page, standardData, activeSearchIndex, browserName }) => {
    test.skip(browserName === "webkit", "Skip safari because it doesn't allow http logins");

    const videoTitle = "Very secret private video";
    const query = `"${videoTitle}"`;

    await test.step("Anonymous cannot see", async () => {
        await startSearch(page, query, "/~tobira");
        await expectNoResults(page, query);
    });

    await test.step("Jose cannot see", async () => {
        await login(page, "jose");
        // We should be forwarded to the search page again
        await expectNoResults(page, query);
    });

    await test.step("Morgan can see", async () => {
        await logout(page, "jose");
        await login(page, "morgan");
        await startSearch(page, query);
        await expect(page.getByRole("img", { name: `Thumbnail for “${videoTitle}”` }))
            .toBeVisible();
    });
});

for (const username of ["jose", "admin"] as const) {
    test(`Video search finds listed & writable (for ${username})`, async ({
        page, standardData, activeSearchIndex, browserName,
    }) => {
        test.skip(browserName === "webkit", "Skip safari because it doesn't allow http logins");

        const toBeVisibleIfAdmin = username === "admin" ? "toBeVisible" : "toBeHidden";

        await page.goto("/");
        await login(page, username);

        // Use page without content blocks
        await page.goto("~manage/realm/content?path=/love/turtles");
        await page.getByRole("button", { name: "Insert a new block here" }).nth(0).click();
        await page.getByRole("button", { name: "Video", exact: true }).click();
        const input = page.locator("div").filter({ hasText: "Select option" }).nth(1);

        // Of the two unlisted videos, jose can only see the one where they have
        // write access to.
        await input.type("unlisted");
        await expect(page.getByText("Unlisted video without series")).toBeVisible();
        await expect(page.getByText("Unlisted video in series"))[toBeVisibleIfAdmin]();
        await page.keyboard.press("Escape");

        // A video, even if listed, is not found if user has no read access.
        await input.type("private");
        await expect(page.getByText("Very secret private video"))[toBeVisibleIfAdmin]();
        await page.keyboard.press("Escape");

        // Listed & readable appear, even if user has no write access.
        await input.type("cat");
        await expect(page.getByText("Black Cat (protected)")).toBeVisible();
    });
}

// TODO:
// - search for video only included in one page & having correct link
