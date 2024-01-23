import { Page, expect } from "@playwright/test";
import { test as base } from "./data";

// Reexport such that everything can be imported from this file.
export const test = base;


export type User = { login: "admin"; displayName: "Administrator" }
    | { login: "björk"; displayName: "Prof. Björk Guðmundsdóttir" }
    | { login: "jose"; displayName: "José Carreño Quiñones" }
    | { login: "morgan"; displayName: "Morgan Yu" }
    | { login: "sabine"; displayName: "Sabine Rudolfs" };

export const login = async (page: Page, userLogin: string) => {
    await expect(async () => {
        await navigateTo("~login", page);
        await page.getByLabel("User ID").fill(userLogin);
        await page.getByLabel("Password").fill("tobira");
        await page.getByRole("button", { name: "Login" }).click();
        await page.waitForURL("/");
    }).toPass({
        intervals: [2000, 5000, 10000],
        timeout: 30 * 1000,
    });
};


export const navigateTo = async (path: string, page: Page) => {
    await expect(async () => {
        await page.goto(path);
        await page.waitForURL(path);
    }).toPass({
        intervals: [2000, 5000, 10000],
        timeout: 30 * 1000,
    });
};


export const deleteRealm = async (page: Page) => {
    const deleteButton = page.locator("button:has-text('Delete')");

    if (!await deleteButton.isVisible()) {
        await page.getByRole("link", { name: "Page settings" }).click();
        await expect(deleteButton).toBeVisible();
    }

    await deleteButton.click();
    await expect(deleteButton.nth(1)).toBeVisible();

    await Promise.all([
        page.waitForResponse(response =>
            response.url().includes("graphql")
                && response.status() === 200),
        deleteButton.nth(1).click(),
    ]);
};


export const realms = ["User", "Regular"] as const;
export type Realm = typeof realms[number];

export const realmSetup = async (page: Page, realm: Realm, user: User, index: number) => {
    if (realm === "User") {
        await navigateTo(`@${user.login}`, page);
        await page.waitForURL(`@${user.login}`);
    } else {
        await navigateTo("/", page);
    }

    await test.step("Create test realms", async () => {
        if (realm === "User") {
            const createRealmButton = page.getByRole("button", { name: "Create your own page" });
            if (!await createRealmButton.isVisible()) {
                await expect(async () => {
                    await deleteRealm(page);
                    await page.waitForURL("/");
                    await navigateTo(`@${user.login}`, page);
                    await expect(createRealmButton).toBeVisible();
                }).toPass();
            }
            await createRealmButton.click();
            await expect(page.getByText(`Edit page “${user.displayName}”`)).toBeVisible();
        }

        if (realm === "Regular") {
            await page.waitForSelector("nav");
            const realms = [`Chicken ${index}`, `Funky Realm ${index}`, `E2E Test Realm ${index}`];
            for (const name of realms) {
                const realmLink = page.locator("nav").getByRole("link", { name: name });
                if (await realmLink.isVisible()) {
                    await realmLink.click();
                    await deleteRealm(page);
                }
            }

            await addSubPage(page, `E2E Test Realm ${index}`);
            await expect(page.getByRole("link", { name: `E2E Test Realm ${index}` })).toBeVisible();
            await page.waitForURL(`~manage/realm/content?path=/e2e-test-realm-${index}`);
        }
    });
};


export const addSubPage = async (page: Page, name: string) => {
    await page.getByRole("link", { name: "Add sub-page" }).first().click();
    await page.getByPlaceholder("Page name").fill(name);
    await page.keyboard.press("Tab");
    await page.keyboard.type(name.trim().toLowerCase().replace(/\s+/g, "-"));
    await Promise.all([
        page.waitForResponse(response =>
            response.url().includes("graphql")
            && response.status() === 200),
        page.getByRole("button", { name: "Create page" }).click(),
    ]);
};


export const blocks = ["Series", "Video", "Text", "Title"] as const;
export type Block = typeof blocks[number];

export const insertBlock = async (page: Page, block: Block) => {
    const addButton = page.getByRole("button", { name: "Insert a new block here" }).first();
    const saveButton = page.getByRole("button", { name: "Save" });

    await addButton.click();
    await page.getByRole("button", { name: block }).first().click();

    if (block === "Title") {
        await test.step("Title block", async () => {
            await page.getByRole("textbox").nth(1).fill("Title");
            await saveButton.click();

            await expect(page.getByRole("heading", { name: "Title" })).toBeVisible();
        });
    }
    if (block === "Text") {
        await test.step("Text block", async () => {
            const pangram = "The quick brown fox jumps over the lazy dog.";
            await page.getByRole("textbox").nth(1).fill(pangram);
            await saveButton.click();

            await expect(page.getByText(pangram)).toBeVisible();
        });
    }
    if (block === "Series") {
        await test.step("Series block", async () => {
            const input = page.locator("div").filter({ hasText: "Select option..." }).nth(1);
            const query = "The best open cat videos";

            await input.type("cat videos");
            await page.getByText("The best open cat videos").click();
            await saveButton.click();

            await expect(page.getByRole("heading", { name: query })).toBeVisible();
        });
    }
    if (block === "Video") {
        await test.step("Video block", async () => {
            const input = page.locator("div").filter({ hasText: "Select option..." }).nth(1);
            const query = "Chicken";

            await input.type("chicken");
            await page.getByText("Series: The best open cat videos").click();
            await page.keyboard.press("Enter");

            await expect(page.getByRole("heading", { name: query }).first()).toBeVisible();
        });
    }
};
