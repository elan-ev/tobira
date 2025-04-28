import { defineConfig, devices } from "@playwright/test";


export default defineConfig({
    testDir: "./tests",
    workers: process.env.CI ? 1 : undefined,
    retries: 0, // TODO
    reporter: "html",

    use: {
        headless: true,
        locale: "en",
        trace: "retain-on-failure",
    },

    projects: [
        {
            name: "chromium",
            use: {
                ...devices["Desktop Chrome"],
                channel: "chrome",
                launchOptions: {
                    args: ["--headless=new"],
                },
            },
        },

        {
            name: "firefox",
            use: { ...devices["Desktop Firefox"] },
        },

        // Safari doesn't allow http logins, so we can't test everything there.
        {
            name: "webkit",
            use: { ...devices["Desktop Safari"] },
        },
    ],
});
