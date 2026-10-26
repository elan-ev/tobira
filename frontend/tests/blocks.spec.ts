import { Page, expect } from "@playwright/test";
import { test, withDb } from "./util/data";
import { USERS, login } from "./util/user";
import { Block, addBlock, insertBlocks } from "./util/blocks";
import { createUserRealm, realmTypes } from "./util/realm";
import { TobiraProcess } from "./util/isolation";

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
    {
        type: "playlist",
        query: "A Playlist With A Twist",
        options: {
            showTitle: true,
            showDescription: false,
            layout: "gallery",
            order: "playlist order",
        },
    },
];
const [titleBlock, textBlock, videoBlock, seriesBlock, playlistBlock] = testBlocks;

// What the series and playlist blocks are changed to in the tests below.
const newVideoLists = {
    series: {
        name: "Series",
        block: seriesBlock,
        title: "Foxes are the very best!!",
        description: "Cat software running on dog hardware.",
    },
    playlist: {
        name: "Playlist",
        block: playlistBlock,
        title: "A Playlist Without A Twist",
        description: "Boring boring boring. But what’s in the box?!",
    },
};

/** Saves the block that is currently in edit mode. */
const saveBlock = async (page: Page) => {
    const saveButton = page.getByRole("button", { name: "Save" });
    await saveButton.click();
    await expect(saveButton).toBeHidden();
};


for (const realmType of realmTypes) {
    const userid = realmType === "User realm" ? "jose" : "sabine";
    const realmPath = realmType === "User realm" ? `/@${userid}` : "/support";
    const realmName = realmType === "User realm" ? USERS[userid] : "Support page";

    /**
     * Creates user realm if necessary, inserts blocks via SQL, logs in and opens
     * the "edit realm contents" page.
     */
    const setup = async (page: Page, tobira: TobiraProcess, blocks: Block[]) => {
        if (realmType === "User realm") {
            await withDb(tobira, sql => sql`
                insert into realms (path_segment, name, owner_display_name)
                values (${`@${userid}`}, ${realmName}, ${realmName})
            `);
        }
        await insertBlocks(tobira, realmPath, blocks);

        await page.goto("/");
        await login(page, userid);
        await page.goto(`~manage/realm/content?path=${encodeURIComponent(realmPath)}`);
        await expect(page.getByRole("heading", { level: 1, name: `Edit page “${realmName}”` }))
            .toBeVisible();
    };

    test.describe(`${realmType} moderator`, () => {
        test.skip(
            ({ browserName }) => browserName === "webkit",
            "Skip safari because it doesn't allow http logins",
        );

        test("Blocks can be added", async ({ page, standardData, activeSearchIndex }) => {
            await test.step("Setup", async () => {
                await page.goto("/");
                await login(page, userid);

                // Go to a non-root realm
                if (realmType === "Regular realm") {
                    await page.locator("nav").getByRole("link", { name: realmName }).click();
                    await expect(page).toHaveURL(realmPath);
                }

                // Create user realm
                if (realmType === "User realm") {
                    await test.step("Create new user realm", async () => {
                        await createUserRealm(page, userid);
                    });
                    await page.locator("nav").getByRole("link", { name: realmName }).click();
                    await expect(page).toHaveURL(realmPath);
                }

                await expect(page.getByRole("heading", { level: 1, name: realmName, exact: true }))
                    .toBeVisible();
            });

            await page.getByRole("link", { name: "Edit page content" }).click();
            for (const [index, block] of testBlocks.entries()) {
                await addBlock(page, index, block);
            }
        });

        test("Title block can be edited", async ({ page, standardData, tobiraProcess }) => {
            await setup(page, tobiraProcess, [titleBlock]);
            const newTitle = "Nice test page";

            await page.getByLabel("Edit block").click();
            await page.getByPlaceholder("Title").fill(newTitle);
            await saveBlock(page);

            await expect(page.getByRole("heading", { name: newTitle })).toBeVisible();
        });

        test("Text block can be edited", async ({ page, standardData, tobiraProcess }) => {
            await setup(page, tobiraProcess, [textBlock]);
            const newText = "The lazy dog jumps over the quick brown fox.";

            await page.getByLabel("Edit block").click();
            await page.getByPlaceholder("You can add your text content").fill(newText);
            await saveBlock(page);

            await expect(page.getByText(newText)).toBeVisible();
        });

        test("Video block can be edited", async ({
            page, standardData, activeSearchIndex, tobiraProcess,
        }) => {
            await setup(page, tobiraProcess, [videoBlock]);
            const editButton = page.getByLabel("Edit block");
            const newVideo = "Currently live!!";

            await test.step("Video can be changed", async () => {
                await editButton.click();
                const input = page.getByRole("combobox");
                await input.pressSequentially(newVideo);
                await page.getByRole("option", { name: newVideo }).click();

                await page.keyboard.press("Enter");
                await expect(page.getByRole("button", { name: "Save" })).toBeHidden();

                await expect(page.getByRole("heading", { name: newVideo })).toBeVisible();
            });

            await test.step("Title can be hidden", async () => {
                await editButton.click();
                await page.getByLabel("Show title").setChecked(false);
                await saveBlock(page);

                await expect(page.getByRole("heading", { name: newVideo })).toBeHidden();
            });

            await test.step("Link can be hidden", async () => {
                await editButton.click();
                await page.getByLabel("Show link to video page").setChecked(false);
                await saveBlock(page);

                await expect(page.getByRole("link", { name: "Video page" })).toBeHidden();
            });
        });

        for (const { name, block, title, description } of Object.values(newVideoLists)) {
            test(`${name} block can be edited`, async ({
                page, standardData, activeSearchIndex, tobiraProcess,
            }) => {
                await setup(page, tobiraProcess, [block]);
                const editButton = page.getByLabel("Edit block");

                await test.step(`${name} can be changed`, async () => {
                    await editButton.click();
                    const input = page.getByRole("combobox");
                    await input.pressSequentially(title);
                    await page.getByRole("option", { name: title }).click();
                    await saveBlock(page);

                    await expect(page.getByRole("heading", { name: title })).toBeVisible();
                });

                await test.step("Layout options can be changed", async () => {
                    await test.step("Videos only", async () => {
                        await editButton.click();
                        await page.getByLabel("Show title").setChecked(false);
                        await page.getByLabel("Show description").setChecked(false);
                        await saveBlock(page);

                        await expect(page.getByRole("heading", { name: title })).toBeHidden();
                        await expect(page.getByText(description)).toBeHidden();
                    });

                    await test.step("Description and videos", async () => {
                        await editButton.click();
                        await page.getByLabel("Show description").setChecked(true);
                        await saveBlock(page);

                        await expect(page.getByRole("heading", { name: title })).toBeHidden();
                        // We use a "hidden" copy of the description text for reference of its
                        // total height. This is useful for collapsing longer texts. However,
                        // Playwright does not seem to distinguish between the hidden and
                        // actually visible text. Hence this expects two elements.
                        await expect(page.getByText(description)).toHaveCount(2);
                    });

                    await test.step("Title, description and videos", async () => {
                        await editButton.click();
                        await page.getByLabel("Show title").setChecked(true);
                        await page.getByLabel("Show description").setChecked(true);
                        await saveBlock(page);

                        await expect(page.getByRole("heading", { name: title })).toBeVisible();
                        await expect(page.getByText(description)).toHaveCount(2);
                    });
                });

                await test.step("Video order can be changed", async () => {
                    await editButton.click();
                    await page.getByLabel("Oldest first").setChecked(true);
                    await expect(page.getByLabel("Oldest first")).toBeChecked();
                    await saveBlock(page);

                    await expect(page.getByRole("button", { name: "Choose video order" }))
                        .toHaveText("Oldest first");
                });
            });
        }

        test("Editing a block leaves the other blocks unchanged", async ({
            page, standardData, tobiraProcess,
        }) => {
            await setup(page, tobiraProcess, testBlocks);
            const newText = "The lazy dog jumps over the quick brown fox.";

            // The edit buttons look the same, so only the order of the blocks tells them apart.
            // The second one belongs to the text block.
            await page.getByLabel("Edit block").nth(1).click();
            await page.getByPlaceholder("You can add your text content").fill(newText);
            await saveBlock(page);

            // Leave edit mode.
            await page.goto(realmPath);
            await expect(page.getByText(newText)).toBeVisible();
            await expect(page.getByText("Nice text.")).toBeHidden();
            // Check that other blocks are still present and titles are unchanged.
            await expect(page.getByRole("heading", { level: 2 })).toHaveText([
                "Nice title",
                "Video of a Tabby Cat",
                "Fabulous Cats",
                "A Playlist With A Twist",
            ]);
        });

        test("Blocks can be removed", async ({ page, standardData, tobiraProcess }) => {
            await setup(page, tobiraProcess, testBlocks);
            const addButtons = page.getByRole("button", { name: "Insert a new block here" });

            for (let remaining = testBlocks.length; remaining > 0; remaining--) {
                await expect(addButtons).toHaveCount(remaining + 1);
                await page.getByLabel("Remove block").first().click();
                await page.getByText("Remove block", { exact: true }).click();
            }

            await expect(addButtons).toHaveCount(1);
        });
    });
}
