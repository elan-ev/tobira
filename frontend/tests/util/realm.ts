import { Page, expect, test } from "@playwright/test";
import { USERS, UserId, login } from "./user";


export const realms = ["User", "Regular"] as const;
export type Realm = typeof realms[number];

/**
 * Creates the user realm for the given user.
 *
 * - Pre-conditions: User is already logged in, the user has no user realm yet.
 * - Post-conditions: User realm created, is on the page that Tobira forwards to
 *   immediately after creating the realm.
 */
const createUserRealm = async (page: Page, userid: UserId) => {
    await page.getByRole("button", { name: USERS[userid] }).click();
    await page.getByRole("link", { name: "My page" }).click();
    await expect(page).toHaveURL(`/@${userid}`);
    await page.getByRole("button", { name: "Create your own page" }).click();
};

/**
 * Sets up or navigates to either a user realm or a non-user realm.
 *
 * - Pre-conditions: User is not logged in. If `realmType` is `user`,
 *   the user must not have a user realm yet.
 * - Post-conditions: If `realmType` is `user`: User realm created, user
 *   is on the page that Tobira forwards to immediately after creating the realm.
 *   Otherwise, if `realmType` is `regular`, nothing was created but the user
 *   is on a non-root realm page ("/support" or "/empty").
 */
export const realmSetup = async (
    page: Page,
    userid: UserId,
    realmType: Realm,
    parentPageName: string,
) => {
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
};


/**
 * Creates a sub-realm on the page you are currently on.
 *
 * - Pre-conditions: logged in & on a realm page with privileges to create a sub-realm.
 * - Post-conditions: Realm created, on the page "Edit realm contents" page.
 */
export const addSubPage = async (page: Page, name: string, pathSegment?: string) => {
    await page.getByRole("link", { name: "Add subpage" }).first().click();
    await page.getByPlaceholder("Page name").fill(name);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Path segment")).toBeFocused();
    await page.keyboard.type(pathSegment ?? name.trim().toLowerCase().replace(/\s+/g, "-"));
    await page.getByRole("button", { name: "Create page" }).click();
    await expect(page.getByRole("heading", { name: `Edit page “${name}”`, level: 1 }))
        .toBeVisible();
};
