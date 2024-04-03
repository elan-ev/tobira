import { expect } from "@playwright/test";
import { test } from "./util/data";
import { USERS, login } from "./util/user";
import { Block, addBlock } from "./util/blocks";
import { createUserRealm, realmTypes } from "./util/realm";

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
        options: {
            showTitle: true,
            showDescription: false,
            layout: "gallery",
            order: "newest first",
        },
    },
];


for (const realmType of realmTypes) {
    test(`${realmType} realm moderator block editing`, async ({
        page, browserName, standardData, activeSearchIndex,
    }) => {
        test.skip(browserName === "webkit", "Skip safari because it doesn't allow http logins");

        const userid = realmType === "User realm" ? "jose" : "sabine";
        const parentPageName = realmType === "User realm" ? USERS[userid] : "Support page";
        await test.step("Setup", async () => {
            await page.goto("/");
            await login(page, userid);

            // Go to a non-root realm
            if (realmType === "Regular realm") {
                await page.locator("nav").getByRole("link", { name: parentPageName }).click();
                await expect(page).toHaveURL("/support");
            }

            // Create user realm
            if (realmType === "User realm") {
                await test.step("Create new user realm", async () => {
                    await createUserRealm(page, userid);
                });
                await page.locator("nav").getByRole("link", { name: parentPageName }).click();
                await expect(page).toHaveURL(`/@${userid}`);
            }
        });

        await page.getByRole("link", { name: "Edit page content" }).click();

        await test.step("Editing", async () => {
            await test.step("Blocks can be added", async () => {
                for (const block of testBlocks) {
                    await addBlock(page, testBlocks.indexOf(block), block);
                }
            });

            await test.step("Blocks can be edited", async () => {
                const saveButton = page.getByRole("button", { name: "Save" });

                await test.step("Title block can be changed", async () => {
                    const newTitle = "Nice test page";
                    const editButton = page
                        .locator("div")
                        .filter({ hasText: /^Nice title$/ })
                        .first()
                        .getByLabel("Edit block");

                    await editButton.click();
                    await page.getByPlaceholder("Title").fill(newTitle);
                    await saveButton.click();

                    await expect(page.getByRole("heading", { name: newTitle })).toBeVisible();
                });

                await test.step("Text block be changed", async () => {
                    const newText = "The lazy dog jumps over the quick brown fox.";
                    const editButton = page
                        .locator("div")
                        .filter({ hasText: /^Nice text\.$/ })
                        .first()
                        .getByLabel("Edit block");

                    await editButton.click();
                    await page.getByPlaceholder("You can add your text content").fill(newText);
                    await saveButton.click();

                    await expect(page.getByText(newText)).toBeVisible();
                });

                await test.step("Video blocks", async () => {
                    const editButton = page
                        .locator("div")
                        .filter({ hasText: "Go to video" })
                        .filter({ hasNotText: "Fabulous Cats" })
                        .first()
                        .getByLabel("Edit block");
                    const newVideo = "Currently live!!";

                    await test.step("Video can be changed", async () => {
                        await editButton.click();
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
                            .toBeHidden();
                    });

                    await test.step("Link can be hidden", async () => {
                        await editButton.click();
                        await page.getByLabel("Show link to video page").setChecked(false);
                        await saveButton.click();

                        await expect(page.getByRole("link", { name: "Go to video page" }))
                            .toBeHidden();
                    });
                });

                await test.step("Series blocks", async () => {
                    const editButton = page
                        .locator("div")
                        .filter({ hasText: "Newest first" })
                        .filter({ hasNotText: "Nice test page" })
                        .first()
                        .getByLabel("Edit block");

                    const newSeries = {
                        title: "Foxes are the very best!!",
                        description: "Cat software running on dog hardware.",
                    };

                    await test.step("Series can be changed", async () => {
                        await editButton.click();
                        const input = page.getByRole("combobox");
                        await input.pressSequentially(newSeries.title);
                        await page.getByRole("option", { name: newSeries.title }).click();
                        await saveButton.click();

                        await expect(page.getByRole("heading", { name: newSeries.title }))
                            .toBeVisible();
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
                                .toBeHidden();
                            await expect(page.getByText(newSeries.description))
                                .toBeHidden();
                        });

                        await test.step("Description and videos", async () => {
                            await editButton.click();
                            await page.getByLabel("Show description").setChecked(true);
                            await saveButton.click();

                            await expect(page.getByRole("heading", { name: newSeries.title }))
                                .toBeHidden();
                            // We use a "hidden" copy of the description text for reference of its
                            // total height. This is useful for collapsing longer texts. However,
                            // Playwright does not seem to distinguish between the hidden and
                            // actually visible text. Hence this expects two elements.
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

                        await test.step("Video order can be changed", async () => {
                            await editButton.click();
                            await page.getByLabel("Oldest first").setChecked(true);
                            await expect(page.getByLabel("Oldest first")).toBeChecked();
                            await saveButton.click();

                            await expect(page.getByRole("button", { name: "Choose video order" }))
                                .toHaveText("Oldest first");
                        });
                    });
                });
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
