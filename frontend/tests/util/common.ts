import { Page, expect } from "@playwright/test";
import { test as base } from "./data";

// Reexport such that everything can be imported from this file.
export const test = base;


export const deleteRealm = async (page: Page) => {
    const deleteButton = page.locator("button:has-text('Delete')");

    if (!await deleteButton.isVisible()) {
        await page.getByRole("link", { name: "Page settings" }).click();
        await expect(deleteButton).toBeVisible();
    }

    await deleteButton.click();
    await expect(deleteButton.nth(1)).toBeVisible();

    await Promise.all([
        page.waitForResponse(response =>
            response.url().includes("graphql")
                && response.status() === 200),
        deleteButton.nth(1).click(),
    ]);
};
