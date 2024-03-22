import { expect } from "@playwright/test";
import { test, realmTypes } from "./util/common";
import { USERS, login } from "./util/user";

for (const realmType of realmTypes) {
    test(`${realmType} danger zone`, async ({
        page, browserName, standardData, activeSearchIndex,
    }) => {
        test.skip(browserName === "webkit", "Skip safari because it doesn't allow http logins");

        const userid = realmType === "UserRealm" ? "morgan" : "sabine";
        const parentPageName = realmType === "UserRealm" ? USERS[userid] : "Far side";
        await test.step("Setup", async () => {
            await page.goto("/");
            await login(page, userid);

            // Go to a non-root realm
            if (realmType === "RegularRealm") {
                await page.locator("nav").getByRole("link", { name: parentPageName }).click();
                await expect(page).toHaveURL("/moon");
            }

            // Go to user realm
            if (realmType === "UserRealm") {
                await page.goto(`/@${userid}`);
                await expect(page).toHaveURL(`/@${userid}`);
            }

            await page.getByRole("link", { name: "Page settings" }).click();
        });

        if (realmType === "RegularRealm") {
            await test.step("Path changing", async () => {
                await test.step("Path can be changed", async () => {
                    const pathInput = page.locator("input[name='pathSegment']");
                    await pathInput.fill("new-path");
                    await page.getByRole("button", { name: "Change path segment" }).click();

                    await expect(page).toHaveURL("~manage/realm?path=%2Fnew-path");
                });

                await test.step("Links are updated", async () => {
                    const testLink = async (linkName: string, heading: string) => {
                        await page.getByRole("link", { name: linkName }).first().click();
                        await expect(page.getByRole("heading", { name: heading })).toBeVisible();
                    };

                    await testLink("Go to page", "Far side");
                    await testLink("Page settings", "Settings of page “Far side”");
                    await testLink("Edit page content", "Edit page “Far side”");
                    await testLink("Add subpage", "Add page");
                    await testLink("Finanzamt", "Finanzamt");
                    await testLink("Far side", "Far side");
                });
            });
        }


        await test.step("Page can be deleted", async () => {
            if (realmType === "UserRealm") {
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

                await expect(page.getByRole("heading", { name: "Tobira Videoportal" }))
                    .toBeVisible();

                await expect(page.getByRole("link", { name: "Far side" }))
                    .toBeHidden();
            }
        });
    });
}

