import { Page, expect } from "@playwright/test";
import { test, realms } from "./util/common";
import { USERS, login } from "./util/user";

for (const realmType of realms) {
    test(`${realmType} danger zone`, async ({
        page, browserName, standardData, activeSearchIndex,
    }) => {
        test.skip(browserName === "webkit", "Skip safari because it doesn't allow http logins");

        const userid = realmType === "User" ? "morgan" : "sabine";
        const parentPageName = realmType === "User" ? USERS[userid] : "Far side";
        await test.step("Setup", async () => {
            await page.goto("/");
            await login(page, userid);

            // Go to a non-root realm
            if (realmType === "Regular") {
                await page.locator("nav").getByRole("link", { name: parentPageName }).click();
                await expect(page).toHaveURL("/moon");
            }

            // Create user realm
            if (realmType === "User") {
                await page.goto(`/@${userid}`);
                await expect(page).toHaveURL(`/@${userid}`);
            }

            await page.getByRole("link", { name: "Page settings" }).click();
        });

        if (realmType === "Regular") {
            await test.step("Path changing", async () => {
                await test.step("Path can be changed", async () => {
                    const pathInput = page.locator("input[name='pathSegment']");
                    await pathInput.fill("new-path");
                    await page.getByRole("button", { name: "Change path segment" }).click();

                    await expect(page).toHaveURL("~manage/realm?path=%2Fnew-path");
                });

                await test.step("Links are updated", async () => {
                    const links = [
                        ["Go to page", "Far side"],
                        ["Page settings", "Settings of page “Far side”"],
                        ["Edit page content", "Edit page “Far side”"],
                        ["Add subpage", "Add page"],
                        ["Finanzamt", "Finanzamt"],
                        ["Far side", "Far side"],
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
            if (realmType === "User") {
                await page.getByRole("button", { name: "Delete" }).click();
                await page.getByRole("button", { name: "Delete" }).nth(1).click();

                await expect(page.getByRole("heading", { name: "Tobira Videoportal" }))
                    .toBeVisible();

                await page.goto(`/@${userid}`);
                await expect(page.getByRole("button", { name: "Create your own page" }))
                    .toBeVisible();
            } else {
                await page.getByRole("link", { name: "Page settings" }).click();

                await page.getByRole("button", { name: "Delete" }).click();
                await page.getByRole("button", { name: "Delete" }).nth(1).click();

                await expect(page.getByRole("link", { name: "Support page" }))
                    .toBeHidden();
            }
        });
    });
}

