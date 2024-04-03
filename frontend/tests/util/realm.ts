import { Page, expect } from "@playwright/test";
import { USERS, UserId } from "./user";


export const realmTypes = ["UserRealm", "RegularRealm"] as const;
export type Realm = typeof realmTypes[number];

/**
 * Creates the user realm for the given user.
 *
 * - Pre-conditions: User is already logged in, the user has no user realm yet.
 * - Post-conditions: User realm created, is on the page that Tobira forwards to
 *   immediately after creating the realm.
 */
export const createUserRealm = async (page: Page, userid: UserId) => {
    await page.getByRole("button", { name: USERS[userid] }).click();
    await page.getByRole("link", { name: "My page" }).click();
    await expect(page).toHaveURL(`/@${userid}`);
    await page.getByRole("button", { name: "Create your own page" }).click();
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
