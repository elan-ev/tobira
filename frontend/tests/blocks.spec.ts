import { Page, expect } from "@playwright/test";
import { test } from "./util/common";
import { USERS } from "./util/user";
import { realmSetup, realms } from "./util/realm";
import { Block, addBlock } from "./util/blocks";

const testBlocks: Block[] = [
    {
        type: "title",
        text: "Nice title",
    },
    {
        type: "text",
        text: "Nice text.",
    },
    {
        type: "video",
        query: "Video of a Tabby Cat",
    },
    {
        type: "series",
        query: "Fabulous Cats",
        // Just repeating the default here in case anything changes...
        options: {
            showTitle: true,
            showDescription: false,
            layout: "gallery",
            order: "newest first",
        },
    },
];


for (const realmType of realms) {
    test(`${realmType} realm moderator block editing`, async ({
        page, browserName, standardData, activeSearchIndex,
    }) => {
        test.skip(browserName === "webkit", "Skip safari because it doesn't allow http logins");

        const userid = realmType === "User" ? "jose" : "sabine";
        const parentPageName = realmType === "User" ? USERS[userid] : "Support page";
        await realmSetup(page, userid, realmType, parentPageName);

        await page.getByRole("link", { name: "Edit page content" }).click();

        await test.step("Editing", async () => {
            await test.step("Blocks can be added", async () => {
                for (const block of testBlocks) {
                    await addBlock(page, testBlocks.indexOf(block), block);
                }
            });

            await test.step("Blocks can be edited", async () => {
                for (const block of testBlocks) {
                    await testBlockEditing(page, testBlocks.indexOf(block), block.type);
                }
            });

            await test.step("Blocks can be removed", async () => {
                const addButtons = page.getByRole("button", { name: "Insert a new block here" });
                const numSlots = await addButtons.count();

                for (const _ of testBlocks) {
                    await page.getByLabel("Remove block").first().click();
                    await page.getByText("Remove block", { exact: true }).click();
                }

                await expect(page.getByRole("button", { name: "Insert a new block here" }))
                    .toHaveCount(numSlots - testBlocks.length);
            });
        });
    });
}


/**
 * Iterates over the block types and tests the editing options of each type by
 * changing certain parameters.
 */
const testBlockEditing = async (page: Page, pos: number, blockType: Block["type"]) => {
    await expect(page.getByRole("heading", { name: "Edit page" })).toBeVisible();

    const saveButton = page.getByRole("button", { name: "Save" });
    const editButton = page.getByLabel("Edit block").nth(pos);
    await editButton.click();

    switch (blockType) {
        case "series": {
            const newSeries = {
                title: "Foxes are the very best!!",
                description: "Cat software running on dog hardware.",
            };
            await test.step("Series can be changed", async () => {
                const input = page.getByRole("combobox");
                await input.pressSequentially(newSeries.title);
                await page.getByRole("option", { name: newSeries.title }).click();
                await saveButton.click();

                await expect(page.getByRole("heading", { name: newSeries.title })).toBeVisible();
            });

            await test.step("Video order can be changed", async () => {
                await editButton.click();
                await page.getByLabel("Oldest first").setChecked(true);
                await expect(page.getByLabel("Oldest first")).toBeChecked();
                await saveButton.click();

                await expect(page.getByRole("button", { name: "Choose video order" }))
                    .toHaveText("Oldest first");
            });

            await test.step("Layout options can be changed", async () => {
                await test.step("Title and videos (initial)", async () => {
                    await expect(page.getByRole("heading", { name: newSeries.title }))
                        .toBeVisible();
                });

                await test.step("Videos only", async () => {
                    await editButton.click();
                    await page.getByLabel("Show title").setChecked(false);
                    await page.getByLabel("Show description").setChecked(false);
                    await saveButton.click();

                    await expect(page.getByRole("heading", { name: newSeries.title }))
                        .not.toBeVisible();
                    await expect(page.getByText(newSeries.description))
                        .not.toBeVisible();
                });

                await test.step("Description and videos", async () => {
                    await editButton.click();
                    await page.getByLabel("Show description").setChecked(true);
                    await saveButton.click();

                    await expect(page.getByRole("heading", { name: newSeries.title }))
                        .not.toBeVisible();
                    // We use a "hidden" copy of the description text for reference of its total
                    // height. This is useful for collapsing longer texts. However, Playwright does
                    // not seem to distinguish between the hidden and actually visible text.
                    // Hence this expects two elements.
                    await expect(page.getByText(newSeries.description)).toHaveCount(2);
                });

                await test.step("Title, description and videos", async () => {
                    await editButton.click();
                    await page.getByLabel("Show title").setChecked(true);
                    await page.getByLabel("Show description").setChecked(true);
                    await saveButton.click();

                    await expect(page.getByRole("heading", { name: newSeries.title }))
                        .toBeVisible();
                    await expect(page.getByText(newSeries.description)).toHaveCount(2);
                });
            });
            break;
        }
        case "video": {
            const newVideo = "Currently live!!";
            await test.step("Video can be changed", async () => {
                const input = page.getByRole("combobox");
                await input.pressSequentially(newVideo);
                await page.getByRole("option", { name: newVideo }).click();

                await page.keyboard.press("Enter");

                await expect(page.getByRole("heading", { name: newVideo }))
                    .toBeVisible();
            });

            await test.step("Title can be hidden", async () => {
                await editButton.click();
                await page.getByLabel("Show title").setChecked(false);
                await saveButton.click();

                await expect(page.getByRole("heading", { name: newVideo }))
                    .not.toBeVisible();
            });

            await test.step("Link can be hidden", async () => {
                await editButton.click();
                await page.getByLabel("Show link to video page").setChecked(false);
                await saveButton.click();

                await expect(page.getByRole("link", { name: "Go to video page" }))
                    .not.toBeVisible();
            });
            break;
        }
        case "text": {
            await test.step("Text can be changed", async () => {
                const newText = "The lazy dog jumps over the quick brown fox.";
                await page.getByPlaceholder("You can add your text content").fill(newText);
                await saveButton.click();

                await expect(page.getByText(newText)).toBeVisible();
            });
            break;
        }
        case "title": {
            await test.step("Title can be changed", async () => {
                const newTitle = "Nice test page";
                await page.getByPlaceholder("Title").fill(newTitle);
                await saveButton.click();

                await expect(page.getByText(newTitle)).toBeVisible();
            });
            break;
        }
    }
};
