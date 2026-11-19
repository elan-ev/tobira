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

            // Wait for new page to be loaded
            await expect(page.getByRole("heading", { level: 1, name: parentPageName, exact: true }))
                .toBeVisible();
        });

        const nav = page.locator("nav").first().getByRole("listitem");
        const navHeader = ["Home", parentPageName];
        const subPages = ["Apple", "Banana", "Cherry"];
        // User realm already has an "Apple" sub-page
        const pagesToAdd = realmType === "User realm" ? ["Banana", "Cherry"] : subPages;
        await test.step("Sub-pages can be added", async () => {
            for (const name of pagesToAdd) {
                await addSubPage(page, name);
                await page.getByRole("navigation", { name: "breadcrumbs" })
                    .getByRole("link", { name: parentPageName })
                    .click();
                await page.getByRole("heading", { name: parentPageName, level: 1 }).waitFor();
            }

            await expect(nav).toHaveText([...navHeader, ...subPages]);
        });

        const settingsLink = page.getByRole("link", { name: "Page settings" });
        const nameSection = page.locator("section")
            .filter({ has: page.getByRole("heading", { name: "Page name" }) });
        const orderSection = page.locator("section")
            .filter({ has: page.getByRole("heading", { name: "Order of subpages" }) });
        const saveName = nameSection.getByRole("button", { name: "Save" });
        const saveOrder = orderSection.getByRole("button", { name: "Save" });
        await test.step("Order of sub-pages can be changed", async () => {
            await test.step("Sort alphabetically descending", async () => {
                await settingsLink.click();
                await page.getByText("Sort alphabetically descending").click();
                await saveOrder.click();

                await expect(nav).toHaveText([...navHeader, ...subPages.slice().reverse()]);
            });

            await test.step("Sort alphabetically ascending", async () => {
                await page.getByText("Sort alphabetically ascending").click();
                await saveOrder.click();

                await expect(nav).toHaveText([...navHeader, ...subPages]);
            });

            await test.step("Manually order", async () => {
                await page.getByText("Manually order").click();
                const items = orderSection.getByRole("listitem");
                await expect(items).toHaveText(subPages);

                const postOrder = ["Banana", "Cherry", "Apple"];
                await items.filter({ hasText: "Apple" })
                    .getByRole("button", { name: "Move down" })
                    .click();
                await items.filter({ hasText: "Cherry" })
                    .getByRole("button", { name: "Move up" })
                    .click();
                await saveOrder.click();

                await expect(nav).toHaveText([...navHeader, ...postOrder]);
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
                await nameSection.getByRole("combobox").selectOption("Video: Long boy");
                await saveName.click();

                await expect(page.getByRole("heading", { name: "Settings of page “Long boy”" }))
                    .toBeVisible();
                await expect(page.getByRole("navigation", { name: "breadcrumbs" })
                    .getByRole("link", { name: "Long boy" })).toBeVisible();
            });

            await test.step("Custom name", async () => {
                await page.reload(); // To clear the name input field
                const name = "Yummy Kale";
                await page.getByText("Name directly").click();
                await page.getByPlaceholder("Page name").fill(name);
                await saveName.click();

                await expect(page.getByRole("heading", { name: `Settings of page “${name}”` }))
                    .toBeVisible();
            });
        });

    });
}
