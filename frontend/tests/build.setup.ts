import { test as setup } from "@playwright/test";
import { execSync } from "child_process";


// The tests run against the files in `build/`, which the Vite dev server
// doesn't update. So we build the frontend first to test the current code.
setup("build frontend", () => {
    setup.skip(!!process.env.CI, "CI already builds the frontend in a previous job");
    execSync("npm run build:dev", { stdio: "inherit" });
});
