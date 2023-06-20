import { defineConfig, devices } from "@playwright/test";


export default defineConfig({
    testDir: "./tests",
    workers: process.env.CI ? 1 : undefined,
    retries: 1,
    reporter: "html",
    expect: { timeout: 20 * 1000 },

    use: {
        baseURL: "http://localhost:3090",
        headless: true,
        locale: "en",
        trace: "retain-on-failure",
    },

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

    webServer: {
        command: "cargo run --manifest-path=../backend/Cargo.toml -- serve",
        url: "http://localhost:3090",
        reuseExistingServer: true,
    },
});
