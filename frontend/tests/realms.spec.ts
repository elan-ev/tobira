import { expect } from "@playwright/test";
import { test, realms } from "./common";
import { USERS, login } from "./util/user";
import { createUserRealm, addSubPage, addBlock } from "./util/realm";


for (const realmType of realms) {
    test(`${realmType} realm moderator editing`, async ({
        page, browserName, standardData, activeSearchIndex,
    }) => {
        test.skip(browserName === "webkit", "Skip safari because it doesn't allow http logins");

        const userid = realmType === "User" ? "jose" : "sabine";
        const parentPageName = realmType === "User" ? USERS[userid] : "Support page";
        await test.step("Setup", async () => {
            await page.goto("/");
            await login(page, userid);

            // Go to a non-root realm
            if (realmType === "Regular") {
                await page.locator("nav").getByRole("link", { name: parentPageName }).click();
                await expect(page).toHaveURL("/support");
            }

            // Create user realm
            if (realmType === "User") {
                await test.step("Create new user realm", async () => {
                    await createUserRealm(page, userid);
                });
                await page.locator("nav").getByRole("link", { name: parentPageName }).click();
                await expect(page).toHaveURL(`/@${userid}`);
            }
        });

        const nav = page.locator("nav").first().getByRole("listitem");
        const subPages = ["Alchemy", "Barnacles", "Cheese"];
        await test.step("Sub-pages can be added", async () => {
            for (const subPage of subPages) {
                await addSubPage(page, subPage);
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
                const postOrder = [1, 2, 0].map(n => preOrder[n] as string);

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
// eslint-disable-next-line capitalized-comments
// eslint-disable-next-line multiline-comment-style
/*
        if (realm === "Regular") {
            await test.step("Path changing", async () => {
                await test.step("Path can be changed", async () => {
                    const pathInput = page.locator("input[name='pathSegment']");
                    await pathInput.fill(`chicken-${realmIndex}`);
                    await page.getByRole("button", { name: "Change path segment" }).click();

                    await expect(page).toHaveURL(`~manage/realm?path=/chicken-${realmIndex}`);
                });

                await test.step("Links are updated", async () => {
                    const links = [
                        ["Go to page", "E2E Test Realm"],
                        ["Page settings", `Settings of page “E2E Test Realm ${realmIndex}”`],
                        ["Edit page content", `Edit page “E2E Test Realm ${realmIndex}”`],
                        ["Add sub-page", "Add page"],
                        ["Barnacles", "Barnacles"],
                        ["E2E Test Realm", "E2E Test Realm"],
                    ];

                    const linkTest = async (page: Page, linkName: string, heading: string) => {
                        await page.getByRole("link", { name: linkName }).first().click();
                        await expect(page.getByRole("heading", { name: heading })).toBeVisible();
                    };

                    for (const [name, heading] of links) {
                        await linkTest(page, name, heading);
                    }
                });
            });
        }


        await test.step("Page can be deleted", async () => {
            await deleteRealm(page);

            if (realm === "User") {
                await navigateTo(`@${user.login}`, page);
                await expect(
                    page.getByRole("button", { name: "Create your own page" }),
                ).toBeVisible();
            } else {
                await expect(
                    page.getByRole("link", { name: `E2E Test realm ${realmIndex}` })
                ).not.toBeVisible();
            }
        });
*/
