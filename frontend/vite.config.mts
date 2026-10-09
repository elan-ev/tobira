import yaml from "@rollup/plugin-yaml";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";


export default defineConfig(({ mode }) => ({
    base: "/~assets/",
    input: "src/index.tsx",
    publicDir: "static",

    plugins: [
        svgr({ svgrOptions: { icon: true } }),
        yaml(),
    ],

    build: {
        outDir: "build",
        sourcemap: true,
        minify: mode !== "development",
        // See also https://vite.dev/guide/backend-integration
        manifest: true,
        rolldownOptions: {
            output: {
                entryFileNames: "bundle.[name].[hash].js",
                chunkFileNames: "bundle.[name].[hash].js",
            },
        },
    },
}));
