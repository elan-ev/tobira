import { defineConfig } from "vite";


export default defineConfig(({ mode }) => ({
    base: "/~assets/",
    input: "src/index.tsx",

    build: {
        outDir: "build",
        sourcemap: true,
        minify: mode !== "development",
        rolldownOptions: {
            output: {
                entryFileNames: "bundle.[name].[hash].js",
                chunkFileNames: "bundle.[name].[hash].js",
            },
        },
    },
}));
