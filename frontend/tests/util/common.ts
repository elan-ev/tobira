import { Page, expect } from "@playwright/test";
import { test as base } from "./data";

// Reexport such that everything can be imported from this file.
export const test = base;




export const navigateTo = async (path: string, page: Page) => {
    await expect(async () => {
        await page.goto(path);
        await page.waitForURL(path);
    }).toPass({
        intervals: [2000, 5000, 10000],
        timeout: 30 * 1000,
    });
};


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


export const realmTypes = ["UserRealm", "RegularRealm"] as const;
export type Realm = typeof realmTypes[number];


export const blocks = ["Series", "Video", "Text", "Title"] as const;
export type Block = typeof blocks[number];

export const insertBlock = async (page: Page, block: Block) => {
    const addButton = page.getByRole("button", { name: "Insert a new block here" }).first();
    const saveButton = page.getByRole("button", { name: "Save" });

    await addButton.click();
    await page.getByRole("button", { name: block }).first().click();

    if (block === "Title") {
        await test.step("Title block", async () => {
            await page.getByRole("textbox").nth(1).fill("Title");
            await saveButton.click();

            await expect(page.getByRole("heading", { name: "Title" })).toBeVisible();
        });
    }
    if (block === "Text") {
        await test.step("Text block", async () => {
            const pangram = "The quick brown fox jumps over the lazy dog.";
            await page.getByRole("textbox").nth(1).fill(pangram);
            await saveButton.click();

            await expect(page.getByText(pangram)).toBeVisible();
        });
    }
    if (block === "Series") {
        await test.step("Series block", async () => {
            const input = page.locator("div").filter({ hasText: "Select option..." }).nth(1);
            const query = "The best open cat videos";

            await input.type("cat videos");
            await page.getByText("The best open cat videos").click();
            await saveButton.click();

            await expect(page.getByRole("heading", { name: query })).toBeVisible();
        });
    }
    if (block === "Video") {
        await test.step("Video block", async () => {
            const input = page.locator("div").filter({ hasText: "Select option..." }).nth(1);
            const query = "Chicken";

            await input.type("chicken");
            await page.getByText("Series: The best open cat videos").click();
            await page.keyboard.press("Enter");

            await expect(page.getByRole("heading", { name: query }).first()).toBeVisible();
        });
    }
};
