import { expect } from "@playwright/test";
import { test } from "./isolation";
import { navigateTo } from "./common";

test("Language selection", async ({ page }) => {
    const html = page.locator("html");
    const english = page.getByRole("checkbox", { name: "English" });
    const german = page.getByRole("checkbox", { name: "Deutsch" });

    await navigateTo("/", page);
    await page.waitForSelector("h1");

    await test.step("Language button is present and opens menu", async () => {
        await page.getByRole("button", { name: "Language selection" }).click();
        await expect(english).toBeVisible();
        await expect(german).toBeVisible();
    });

    await test.step("Language can be changed", async () => {
        // The initial language for these tests is english if not
        // explicitly specified otherwise in the configuration.
        await expect(english).toBeChecked();
        await expect(html).toHaveAttribute("lang", "en");

        await test.step("to german", async () => {
            await expect(german).toBeVisible();
            await german.dispatchEvent("click");

            await page.getByRole("button", { name: "Sprachauswahl" }).click();
            await expect(german).toBeChecked();
            await expect(html).toHaveAttribute("lang", "de");
        });

        await test.step("to english", async () => {
            await english.dispatchEvent("click");
            await expect(html).toHaveAttribute("lang", "en");
        });
    });
});
