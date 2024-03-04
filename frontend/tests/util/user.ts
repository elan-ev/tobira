import { Page, expect } from "@playwright/test";


export const USERS = {
    "admin": "Administrator",
    "björk": "Prof. Björk Guðmundsdóttir",
    "jose": "José Carreño Quiñones",
    "morgan": "Morgan Yu",
    "sabine": "Sabine Rudolfs",
};

export type UserId = keyof typeof USERS;

/**
 * Logs in as the given user.
 *
 * - Pre-conditions: Not logged in.
 * - Post-conditions: Logged in & on the previous page.
 */
export const login = async (page: Page, username: UserId) => {
    const prevUrl = page.url();
    await page.getByRole("link", { name: "Login" }).click({ });
    await expect(page).toHaveURL("~login");
    await page.getByLabel("User ID").fill(username);
    await page.getByLabel("Password").fill("tobira");
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page).toHaveURL(prevUrl);
};
