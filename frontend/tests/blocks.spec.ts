import { test, expect, Page } from "@playwright/test";
import { Block, blocks, deleteRealm, insertBlock, login, realmSetup, realms } from "./common";


for (const realm of realms) {
    test(`${realm} realm blocks`, async ({ page, browserName }) => {
        test.skip(browserName === "webkit", "Skip safari because it doesn't allow http logins");
        await test.step("Setup", async () => {
            await login(page, "admin");
            await realmSetup(page, realm);
        });

        await test.step("Editing", async () => {
            await test.step("Blocks can be added", async () => {
                for (const block of blocks) {
                    await insertBlock(page, block);
                }
            });

            await test.step("Blocks can be edited", async () => {
                for (const [index, block] of blocks.slice().reverse().entries()) {
                    await editBlock(page, block, index);
                }
            });

            await test.step("Blocks can be removed", async () => {
                for (const _ of blocks) {
                    await removeBlock(page);
                }

                await expect(page.locator("_react=EditBlock")).toHaveCount(0);
            });
        });

        await test.step("Cleanup", async () => {
            await deleteRealm(page);
        });
    });
}


const editBlock = async (page: Page, block: Block, index: number) => {
    const saveButton = page.getByRole("button", { name: "Save" });
    const editBlock = page.locator("_react=EditBlock").nth(index);
    const editButton = editBlock.getByRole("button", { name: "Edit block" });

    const editText = async (page: Page, text: string) => {
        await editBlock.getByRole("textbox").fill(text);
        await saveButton.click();

        await expect(page.getByText(text)).toBeVisible();
    };

    await editButton.click();

    if (block === "Series") {
        await test.step("Series can be changed", async () => {
            const input = page.locator("_react=SeriesSelector");
            const query = "Mixed Test Series";
            await input.type("mixed test");
            await page.getByText(query).click();
            await input.press("Enter");

            await expect(page.getByRole("heading", { name: query })).toBeVisible();
        });

        await test.step("Video order can be changed", async () => {
            await editButton.click();
            await page.getByRole("button", { name: "Oldest first" }).click();
            await saveButton.click();

            await expect(page.getByRole("button", { name: "Choose video order" }))
                .toHaveText("Oldest first");
        });

        await test.step("Layout options work as intended", async () => {
            await test.step("Title and videos (initial)", async () => {
                await expect(
                    editBlock.getByRole("heading", { name: "Mixed Test Series" }),
                ).toBeVisible();
            });

            await test.step("Videos only", async () => {
                await editButton.click();
                await page.getByRole("button", { name: "Videos only" }).click();
                await saveButton.click();

                await expect(
                    editBlock.getByRole("heading", { name: "Mixed Test Series" }),
                ).not.toBeVisible();
            });

            await test.step("Description and videos", async () => {
                await editButton.click();
                await page.getByRole("button", { name: "Description and videos" }).first().click();
                await saveButton.click();

                await expect(
                    editBlock.getByRole("heading", { name: "Mixed Test Series" }),
                ).not.toBeVisible();
                await expect(
                    editBlock.getByText("Some normal events, some scheduled ones and a live one."),
                ).toBeVisible();
            });

            await test.step("Title, description and videos", async () => {
                await editButton.click();
                await page
                    .getByRole("button", { name: "Title, Description and videos" })
                    .first()
                    .click();
                await saveButton.click();

                await expect(
                    editBlock.getByRole("heading", { name: "Mixed Test Series" }),
                ).toBeVisible();
                await expect(
                    editBlock.getByText("Some normal events, some scheduled ones and a live one."),
                ).toBeVisible();
            });
        });
    }
    if (block === "Video") {
        await test.step("Video can be changed", async () => {
            const input = page.locator("_react=EventSelector");
            await input.type("belemmi");
            await page.getByText("Series: The best open cat videos").click();
            await input.press("Enter");

            await expect(page
                .getByRole("heading", { name: "Video Of A Tabby Cat" })
                .first())
                .toBeVisible();
        });

        await test.step("Title can be hidden", async () => {
            await editButton.click();
            await page.getByText("Show title").click();
            await saveButton.click();

            await expect(editBlock.getByRole("heading")).toHaveCount(0);
        });
    }
    if (block === "Text") {
        await test.step("Text can be changed", async () => {
            await editText(page, "The lazy dog jumps over the quick brown fox.");
        });
    }
    if (block === "Title") {
        await test.step("Title can be changed", async () => {
            await editText(page, "Super unique title");
        });
    }
};

const removeBlock = async (page: Page) => {
    const block = page.locator("_react=EditBlock").first();
    await block.locator("_react=RemoveButton").click();
    await page.getByText("Remove block", { exact: true }).click();
};
