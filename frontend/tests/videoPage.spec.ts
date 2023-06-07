import { test, expect } from "@playwright/test";
import { navigateTo } from "./common";


// Ideally this would get a semi-random event from the database that is
// (1) part of a series and (2) we know is included as a video in tobira.
// Though this also comes with the caveat that I don't know if there is a way to
// match an event to it's path in tobira.

test("Video page", async ({ page }) => {
    const seriesBlock = page.locator("_react=SeriesBlockContainer");
    const metadatumLocator = (datum: "duration" | "part of series") =>
        page.locator("_react=Metadata").locator(`dd:right-of(dt:has-text("${datum}"))`).first();

    await test.step("Setup", async () => {
        await navigateTo("/", page);
        await seriesBlock.getByRole("link").first().click();
        await page.waitForSelector("nav");
    });

    await test.step("Video player", async () => {
        const player = page.locator("_react=PaellaPlayer");

        await test.step("Player is present", async () => {
            await expect(player).toBeVisible();
        });

        await test.step("Video is playable", async () => {
            await player.click();

            await expect(page.locator(".progress-indicator-container")).toBeVisible();
        });
    });

    await test.step("Share button", async () => {
        const shareButton = page.locator("_react=ShareButton");

        await test.step("Button is present", async () => {
            await expect(shareButton).toBeVisible();
        });

        await test.step("Button opens share menu", async () => {
            await shareButton.click();

            await expect(
                shareButton.getByRole("button").first(),
            ).toHaveAttribute("aria-expanded", "true");
        });
    });

    await test.step("Metadata fields are present", async () => {
        // We can at least test the presence of "Duration" and "Part of series" values
        // as those should always be shown for these tests.
        await expect(metadatumLocator("part of series")).not.toBeEmpty();
        await expect(metadatumLocator("duration")).not.toBeEmpty();
    });

    await test.step("Series block", async () => {
        const series = await metadatumLocator("part of series").textContent();

        await test.step("Block is present", async () => {
            await expect(seriesBlock).toBeVisible();
        });

        await test.step("Block has the correct tile", async () => {
            const blockTitle = page.getByRole("heading", { name: `More from “${series}”` });
            await expect(seriesBlock.locator(blockTitle)).toBeVisible();
        });

        // Only do this step if block contains at least one other event.
        const siblingEvent = seriesBlock.getByRole("link").first();
        if (await siblingEvent.isVisible()) {
            await test.step("Block contains sibling event tile", async () => {
                await test.step("Tile links to event", async () => {
                    const siblingId = await siblingEvent.getAttribute("href") as string;
                    await siblingEvent.click();
                    await expect(page).toHaveURL(siblingId);
                });

                await test.step("Event is part of the correct series", async () => {
                    const siblingSeries = await metadatumLocator("part of series").textContent();
                    expect(siblingSeries).toBe(series);
                });
            });
        }
    });
});