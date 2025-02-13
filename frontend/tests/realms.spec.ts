import { expect } from "@playwright/test";
import { test } from "./util/data";
import { USERS, login } from "./util/user";
import { addSubPage, realmTypes } from "./util/realm";
import { addBlock } from "./util/blocks";


for (const realmType of realmTypes) {
    test(`${realmType} moderator editing`, async ({
        page, browserName, standardData, activeSearchIndex,
    }) => {
        test.skip(browserName === "webkit", "Skip safari because it doesn't allow http logins");

        const userid = realmType === "User realm" ? "morgan" : "sabine";
        const parentPageName = realmType === "User realm" ? USERS[userid] : "Support page";
        await test.step("Setup", async () => {
            await page.goto("/");
            await login(page, userid);

            // Go to a non-root realm
            if (realmType === "Regular realm") {
                await page.locator("nav").getByRole("link", { name: parentPageName }).click();
                await expect(page).toHaveURL("/support");
            }

            // Go to user realm
            if (realmType === "User realm") {
                await page.goto(`/@${userid}`);
                await expect(page).toHaveURL(`/@${userid}`);
            }
        });

        const nav = page.locator("nav").first().getByRole("listitem");
        const subPages = ["Apple", "Banana", "Cherry"];
        // User realm already has an "Apple" sub-page
        const pagesToAdd = realmType === "User realm" ? ["Banana", "Cherry"] : subPages;
        await test.step("Sub-pages can be added", async () => {
            for (const name of pagesToAdd) {
                await addSubPage(page, name);
                await page.locator("nav > ol").getByRole("link", { name: parentPageName }).click();
                await page.getByRole("heading", { name: parentPageName, level: 1 }).waitFor();
            }

            await expect(nav).toHaveText(subPages);
        });

        const saveButton = page.getByRole("button", { name: "Save" });
        const settingsLink = page.getByRole("link", { name: "Page settings" });
        await test.step("Order of sub-pages can be changed", async () => {
            await test.step("Sort alphabetically descending", async () => {
                await settingsLink.click();
                await page.getByText("Sort alphabetically descending").click();
                await saveButton.nth(1).click();

                await expect(nav).toHaveText(subPages.slice().reverse());
            });

            await test.step("Sort alphabetically ascending", async () => {
                await page.getByText("Sort alphabetically ascending").click();
                await saveButton.nth(1).click();

                await expect(nav).toHaveText(subPages);
            });

            await test.step("Manually order", async () => {
                const options = page.locator("ol").nth(1);
                const buttons = [[1, 1], [2, 0], [2, 1], [3, 0]].map(([item, button]) =>
                    options.locator(`li:nth-child(${item}) >> button`).nth(button));

                await page.getByText("Manually order").click();
                const preOrder = await Promise.all(
                    [1, 2, 3].map(n => options.locator(`li:nth-child(${n})`).textContent()),
                );
                // Indexes should change from 0 1 2 => 1 2 0.
                expect(preOrder).not.toContain(null);
                const postOrder = [1, 2, 0].map(n => preOrder[n]!);

                for (const index of [3, 1, 2, 0]) {
                    await buttons[index].click();
                }
                await saveButton.nth(1).click();

                await expect(nav).toHaveText(postOrder);
            });
        });

        await test.step("Name can be changed", async () => {
            const derivedOption = page.getByText("Derive name from video or series");

            await test.step("Derived name not possible without blocks", async () => {
                await derivedOption.click();
                await expect(page.getByText("There are no linkable video/series on this page."))
                    .toBeVisible();
            });

            await test.step("Derived name", async () => {
                await page.getByRole("link", { name: "Edit page content" }).click();
                await addBlock(page, 0, { type: "video", query: "long" });

                await settingsLink.click();
                await derivedOption.click();
                await derivedOption
                    .locator("..")
                    .locator("..")
                    .getByRole("combobox")
                    .selectOption("Video: Long boy");
                await saveButton.first().click();

                await expect(page.getByRole("heading", { name: "Settings of page “Long boy”" }))
                    .toBeVisible();
                await expect(page.locator("nav > ol").getByRole("link", { name: "Long boy" }))
                    .toBeVisible();
            });

            await test.step("Custom name", async () => {
                await page.reload(); // To clear the name input field
                const name = "Yummy Kale";
                await page.getByText("Name directly").click();
                await page.getByPlaceholder("Page name").fill(name);
                await saveButton.first().click();

                await expect(page.getByRole("heading", { name: `Settings of page “${name}”` }))
                    .toBeVisible();
            });
        });

    });
}
