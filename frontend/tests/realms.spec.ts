import { test, expect, Page } from "@playwright/test";
import {
    addSubPage,
    deleteRealm,
    insertBlock,
    login,
    navigateTo,
    realmSetup,
    realms,
} from "./common";


for (const realm of realms) {
    test(`${realm} realm editing`, async ({ page, browserName }) => {
        test.skip(browserName === "webkit", "Skip safari because it doesn't allow http logins");

        const user: User = browserName === "chromium"
            ? { login: "admin", displayName: "Administrator" }
            : { login: "sabine", displayName: "Sabine Rudolfs" };
        const realmIndex = browserName === "chromium" ? 2 : 3;

        const settingsLink = page.getByRole("link", { name: "Page settings" });
        const saveButton = page.getByRole("button", { name: "Save" });
        const subPages = ["Alchemy", "Barnacles", "Cheese"];
        const nav = page.locator("nav").first().getByRole("listitem");

        await test.step("Setup", async () => {
            await login(page, user.login);
            await realmSetup(page, realm, user, realmIndex);
            await insertBlock(page, "Video");
        });

        await test.step("Sub-pages can be added", async () => {
            const target = realm === "User" ? `@${user.login}` : `e2e-test-realm-${realmIndex}`;
            for (const subPage of subPages) {
                await expect(async () => {
                    await navigateTo(target, page);
                    await addSubPage(page, subPage);
                    await page.waitForSelector(`h1:has-text("Edit page “${subPage}”")`);
                }).toPass();
            }

            await navigateTo(target, page);
            await expect(nav).toHaveText(subPages);
        });

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
            await test.step("Derived name", async () => {
                await page.locator("label:has-text('Derive name from video or series')").click();
                await page.getByRole("combobox").selectOption("Video: Chicken");
                await saveButton.first().click();

                await expect(
                    page.getByRole("heading", { name: "Settings of page “Chicken”" }),
                ).toBeVisible();
            });

            await test.step("Custom name", async () => {
                await page.locator("label:has-text('Name directly')").click();
                await page.locator("#rename-field").fill(`Funky Realm ${realmIndex}`);
                await saveButton.first().click();

                await expect(
                    page.getByRole(
                        "heading", { name: `Settings of page “Funky Realm ${realmIndex}”` }
                    ),
                ).toBeVisible();

                await page.locator("#rename-field").fill(`E2E Test Realm ${realmIndex}`);
                await saveButton.first().click();
                await expect(
                    page.getByRole("heading", { name: `E2E Test Realm ${realmIndex}` })
                ).toBeVisible();
            });
        });

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
                    page.locator("_react=CreateUserRealm").nth(1).getByRole("button"),
                ).toBeVisible();
            } else {
                await expect(
                    page.getByRole("link", { name: `E2E Test realm ${realmIndex}` })
                ).not.toBeVisible();
            }
        });
    });
}

