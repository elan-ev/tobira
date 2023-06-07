import { Page, expect, test } from "@playwright/test";


type User = "admin" | "björk" | "jose" | "morgan" | "sabine";

export const login = async (page: Page, user: User) => {
    await expect(async () => {
        await navigateTo("~login", page);
        await page.getByLabel("User ID").fill(user);
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

    await expect(async () => {
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
    }).toPass();
};


export const realms = ["User", "Regular"] as const;
export type Realm = typeof realms[number];

export const realmSetup = async (page: Page, realm: Realm) => {
    if (realm === "User") {
        await navigateTo("@admin", page);
        await page.waitForURL("@admin");
    } else {
        await navigateTo("/", page);
    }

    await test.step("Create test realms", async () => {
        if (realm === "User") {
            const createRealmButton = page
                .locator("_react=CreateUserRealm")
                .nth(1)
                .getByRole("button");
            if (!await createRealmButton.isVisible()) {
                await expect(async () => {
                    await deleteRealm(page);
                    await page.waitForURL("/");
                    await navigateTo("@admin", page);
                    await expect(createRealmButton).toBeVisible();
                }).toPass();
            }
            await createRealmButton.click();
            await expect(page.getByText("Edit page “Administrator”")).toBeVisible();
        }

        if (realm === "Regular") {
            await page.waitForSelector("nav");
            for (const name of ["Chicken", "Funky Realm", "E2E Test Realm"]) {
                const realmLink = page.locator("nav").getByRole("link", { name: name });
                if (await realmLink.isVisible()) {
                    await realmLink.click();
                    await deleteRealm(page);
                }
            }

            await addSubPage(page, "E2E Test Realm");
            await expect(page.getByRole("link", { name: "E2E Test Realm" })).toBeVisible();
            await page.waitForURL("~manage/realm/content?path=/e2e-test-realm");
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
    const addButton = page.locator("_react=AddButtons").first();
    const saveButton = page.getByRole("button", { name: "Save" });
    await addButton.click();
    await page.getByRole("button", { name: block }).first().click();

    if (block === "Title") {
        await test.step("Title block", async () => {
            await page.getByPlaceholder("You can put your title here.").fill("Title");
            await saveButton.click();

            await expect(page.getByRole("heading", { name: "Title" })).toBeVisible();
        });
    }
    if (block === "Text") {
        await test.step("Text block", async () => {
            const pangram = "The quick brown fox jumps over the lazy dog.";
            await page
                .getByPlaceholder("You can put your text content here. You can even use Markdown.")
                .fill(pangram);
            await saveButton.click();

            await expect(page.getByText(pangram)).toBeVisible();
        });
    }
    if (block === "Series") {
        await test.step("Series block", async () => {
            const input = page.locator("_react=SeriesSelector");
            const query = "The best open cat videos";

            await input.type("cat videos");
            await page.getByText("The best open cat videos").click();
            await saveButton.click();

            await expect(page.getByRole("heading", { name: query })).toBeVisible();
        });
    }
    if (block === "Video") {
        await test.step("Video block", async () => {
            const input = page.locator("_react=EventSelector");
            const query = "Chicken";

            await input.type("chicken");
            await page.getByText("Series: The best open cat videos").click();
            await input.press("Enter");

            await expect(page.getByRole("heading", { name: query }).first()).toBeVisible();
        });
    }
};