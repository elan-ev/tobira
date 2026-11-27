import { defineConfig } from "vite";


// Builds the service worker, served from `/~sw.js`.
// Built after the app, whose build empties `build/` first.
export default defineConfig(({ mode }) => ({
    input: "src/sw/index.ts",

    build: {
        outDir: "build",
        emptyOutDir: false,
        sourcemap: true,
        minify: mode !== "development",
        rolldownOptions: {
            output: {
                format: "iife",
                entryFileNames: "~sw.js",
            },
        },
    },
}));
