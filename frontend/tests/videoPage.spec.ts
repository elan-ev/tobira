import { expect } from "@playwright/test";
import { test } from "./util/data";


test("Video page", async ({ page, standardData, browserName }) => {
    const metadatumLocator = (datum: "duration" | "part of series") =>
        page.locator(`dd:right-of(dt:has-text("${datum}"))`).first();

    await test.step("Setup", async () => {
        await page.goto("/");
        await page
            .locator("div")
            .filter({ hasText: /^0:12Video of a Tabby CatGustavo Belemmi2 years ago$/ })
            .getByRole("link")
            .click();
        await page.waitForSelector("nav");
    });

    await test.step("Video player", async () => {
        const player = page.locator(".preview-container");

        await test.step("Player is present", async () => {
            await expect(player).toBeVisible();
        });

        await test.step("Video is playable", async () => {
            test.skip(browserName === "webkit", "Paella does not load for Safari"); // TODO
            await player.click();
            await expect(page.locator(".progress-indicator-container")).toBeVisible();
        });
    });

    await test.step("Share button", async () => {
        const shareButton = page.getByRole("button", { name: "Share" });

        await test.step("Button is present", async () => {
            await expect(shareButton).toBeVisible();
        });

        await test.step("Button opens share menu", async () => {
            await shareButton.click();

            await expect(shareButton).toHaveAttribute("aria-expanded", "true");
        });
    });

    await test.step("Metadata fields are present", async () => {
        // We can at least test the presence of "Duration" and "Part of series" values
        // as those should always be shown for these tests.
        await expect(metadatumLocator("part of series")).toHaveText("Fabulous Cats");
        await expect(metadatumLocator("duration")).toHaveText("0:12");
    });

    await test.step("Series block", async () => {
        const series = await metadatumLocator("part of series").textContent();

        await test.step("Block is present", async () => {
            await expect(
                page.getByRole("heading", { name: `More from “${series}”` })
            ).toBeVisible();
        });

        await test.step("Block contains sibling event tile", async () => {
            const siblingEvent = page
                .locator("div")
                .filter({ hasText: /^0:12Dual Stream CatsGustavo Belemmi, klimkin2 years ago$/ })
                .getByRole("link");
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
    });
});
