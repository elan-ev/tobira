import { defineConfig, devices } from "@playwright/test";


/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
    testDir: "./tests",
    workers: 1,
    retries: 1,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: "html",
    expect: { timeout: 10 * 1000 },
    /**
     * Shared settings for all the projects below.
     * See https://playwright.dev/docs/api/class-testoptions.
     */
    use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
        baseURL: process.env.CI ? "http://localhost:3090" : "http://localhost:8030",
        headless: true,
        screenshot: "only-on-failure",
        locale: "en",

        /**
         * Collect trace when retrying the failed test.
         * See https://playwright.dev/docs/trace-viewer
         */
        trace: "retain-on-failure",
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"], channel: "chrome" },
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

    /* Run your local dev server before starting the tests */
    webServer: {
        command: "cargo run --manifest-path=../backend/Cargo.toml -- serve",
        url: "http://localhost:3090",
        timeout: 120 * 1000,
        reuseExistingServer: true,
    },
});
