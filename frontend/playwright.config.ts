import { defineConfig, devices } from "@playwright/test";


/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
    testDir: "./tests",
    retries: 2,
    workers: 1,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: "html",
    timeout: 60 * 1000,
    expect: { timeout: 10 * 1000 },
    /**
     * Shared settings for all the projects below.
     * See https://playwright.dev/docs/api/class-testoptions.
     */
    use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
        baseURL: "http://localhost:8030/",
        headless: true,
        screenshot: "only-on-failure",
        locale: "en",

        /**
         * Collect trace when retrying the failed test.
         * See https://playwright.dev/docs/trace-viewer
         */
        trace: "retain-on-failure",
        video: "retain-on-failure",
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

        // {
        //     name: "webkit",
        //     use: { ...devices["Desktop Safari"] },
        // },

        /* Test against mobile viewports. */
        // {
        //   name: 'Mobile Chrome',
        //   use: { ...devices['Pixel 5'] },
        // },
        // {
        //   name: 'Mobile Safari',
        //   use: { ...devices['iPhone 12'] },
        // },
    ],

    /* Run your local dev server before starting the tests */
    // webServer: {
    //   command: 'npm run start',
    //   url: 'http://127.0.0.1:3000',
    //   reuseExistingServer: !process.env.CI,
    // },
});
