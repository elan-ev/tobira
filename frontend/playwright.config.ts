import { defineConfig, devices } from "@playwright/test";


export default defineConfig({
    testDir: "./tests",
    // Two workers for CI as it's likely ok for github action runners.
    workers: process.env.CI ? 2 : undefined,
    // Retry once in CI, so a single flaky test doesn't fail the whole job.
    // These still show up as "flaky" in the report.
    retries: process.env.CI ? 1 : 0,
    reporter: "html",

    use: {
        headless: true,
        locale: "en",
        trace: "retain-on-failure",
    },

    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
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
