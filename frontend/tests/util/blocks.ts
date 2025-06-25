import { Page, expect } from "@playwright/test";


export type Block =
    | {
        type: "title";
        text: string;
    }
    | {
        type: "text";
        text: string;
    }
    | {
        type: "video";
        query: string;
        showTitle?: boolean;
        showLink?: boolean;
    }
    | {
        type: "series";
        query: string;
        options?: {
            showTitle?: boolean;
            showDescription?: boolean;
            layout: "slider" | "gallery" | "list";
            order: "newest first" | "oldest first" | "a to z" | "z to a";
        };
    }
    | {
        type: "playlist";
        query: string;
        options?: {
            showTitle?: boolean;
            showDescription?: boolean;
            layout: "slider" | "gallery" | "list";
            order: "playlist order" | "newest first" | "oldest first" | "a to z" | "z to a";
        };
    };


/**
 * Adds the specified block. For series and video blocks, picks the first result
 * returned for `query`. `query` must be a substring of said result's title.
 *
 * - Pre-conditions: logged in, already on "edit realm contents" page.
 * - Post-conditions: added block, still on "edit realm contents" page.
 */
export const addBlock = async (page: Page, pos: number, block: Block) => {
    await expect(page.getByRole("heading", { name: "Edit page" })).toBeVisible();

    const addButtons = page.getByRole("button", { name: "Insert a new block here" });
    const saveButton = page.getByRole("button", { name: "Save" });
    const numSlots = await addButtons.count();

    await addButtons.nth(pos).click();
    await page.getByRole("button", { name: block.type }).click();

    switch (block.type) {
        case "title": {
            await page.getByPlaceholder("Title").fill(block.text);
            await saveButton.click();
            break;
        }
        case "text": {
            await page.getByPlaceholder("You can add your text content here").fill(block.text);
            await saveButton.click();
            break;
        }
        case "video": {
            const input = page.getByRole("combobox");
            await input.pressSequentially(block.query);
            await page.getByRole("img", { name: block.query }).click();

            const titleCheckbox = page.getByLabel("Show title");
            await expect(titleCheckbox).toBeChecked();
            await titleCheckbox.setChecked(block.showTitle ?? true);
            const linkCheckbox = page.getByLabel("Show link to video page");
            await expect(linkCheckbox).toBeChecked();
            await linkCheckbox.setChecked(block.showTitle ?? true);

            await saveButton.click();
            break;
        }
        case "series":
        case "playlist": {
            const input = page.getByRole("combobox");
            await input.pressSequentially(block.query);
            await page.getByRole("option", { name: block.query }).click();

            const titleCheckbox = page.getByLabel("Show title");
            await expect(titleCheckbox).toBeChecked();
            await titleCheckbox.setChecked(block.options?.showTitle ?? true);

            const descriptionCheckbox = page.getByLabel("Show description");
            await expect(descriptionCheckbox).not.toBeChecked();
            await descriptionCheckbox.setChecked(block.options?.showDescription ?? false);

            const layoutRadio = page.getByLabel(block.options?.layout ?? "Gallery");
            await expect(layoutRadio).toBeChecked();
            await layoutRadio.setChecked(true);

            const orderRadio = page.getByLabel(block.options?.order ?? "Newest first");
            await expect(orderRadio).toBeChecked();
            await orderRadio.setChecked(true);

            await saveButton.click();
            break;
        }
    }

    await expect(addButtons).toHaveCount(numSlots + 1);
    await expect(saveButton).toBeHidden();
};
