import { test, expect } from "@playwright/test";
import { navigateTo } from "./common";

test("Language selection", async ({ page }) => {
    const html = page.locator("html");
    const languageMenu = page.locator("_react=WithFloatingMenu");
    const trigger = languageMenu.locator("_react=FloatingTrigger");
    const english = page.getByRole("checkbox", { name: "English" });
    const german = page.getByRole("checkbox", { name: "Deutsch" });

    await navigateTo("/", page);
    await page.waitForSelector("nav");

    await test.step("Language button is present and opens menu", async () => {
        await trigger.click();
        await expect(languageMenu.locator("_react=FloatingMenu")).toBeVisible();
    });

    await test.step("Language can be changed", async () => {
        // The initial language for these tests is english if not
        // explicitly specified otherwise in the configuration.
        await expect(english).toBeChecked();
        await expect(html).toHaveAttribute("lang", "en");

        await test.step("To german", async () => {
            await expect(german).toBeVisible();
            await german.dispatchEvent("click");

            await trigger.click();
            await expect(german).toBeChecked();
            await expect(html).toHaveAttribute("lang", "de");
        });

        await test.step("To english", async () => {
            await english.dispatchEvent("click");
            await expect(html).toHaveAttribute("lang", "en");
        });
    });
});