import { expect } from "@playwright/test";
import { test } from "./util/data";
import { login, logout } from "./util/user";


test("MySeries", async ({ page, browserName, standardData, activeSearchIndex }) => {
    test.skip(browserName === "webkit", "Skip safari because it doesn't allow http logins");

    await page.goto("/");
    await login(page, "sabine");

    await test.step("Go to 'My series'", async () => {
        await page.goto("/~manage");
        await page.getByText("My Series").click();
        await expect(page).toHaveURL("~manage/series");
    });

    const catLink = page.getByRole("link", { name: "Fabulous Cats", exact: true });
    await test.step("Correct series listed", async () => {
        await expect(catLink).toBeAttached();
        const foxLink = page.getByRole("link", { name: "Foxes are the very best!!", exact: true });
        await expect(foxLink).toBeAttached();
    });

    await test.step("Single Series", async () => {
        await catLink.click();
        await expect(page).toHaveURL(/~manage\/series\/[^/]+/);
        await expect(page.getByRole("button", { name: "Share" })).toBeAttached();
        await expect(page.getByRole("button", { name: "Delete series" })).toBeAttached();
    });

    const catUrl = page.url();

    await test.step("Access control", async () => {
        await page.getByRole("link", { name: "Access policy" }).click();
        await expect(page).toHaveURL(catUrl + "/access");
    });

    // Get another link to a series where jose doesn't even have read access.
    let dogUrl: string | null;
    await test.step("Admin sees all", async () => {
        await logout(page, "sabine");
        await login(page, "admin");
        await page.goto("/~manage/series");
        dogUrl = await page.getByRole("link", { name: "Loyal Dogs", exact: true })
            .getAttribute("href");
    });

    const assertErrorPage = async (url: string) => {
        await page.goto(url);
        const errorText = "You are not authorized to view this page.";
        await expect(page.getByText(errorText)).toBeAttached();
        await expect(page.getByRole("link", { name: "Access policy" })).not.toBeAttached();
    };

    await test.step("No access error without user", async () => {
        await logout(page, "admin");

        await assertErrorPage(catUrl);
        await assertErrorPage(catUrl + "/access");
        await assertErrorPage(dogUrl!);
        await assertErrorPage(dogUrl + "/access");
    });

    await test.step("No access error without user", async () => {
        await login(page, "jose");

        await assertErrorPage(catUrl);
        await assertErrorPage(catUrl + "/access");
        await assertErrorPage(dogUrl!);
        await assertErrorPage(dogUrl + "/access");
    });

});
