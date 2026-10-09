import yaml from "@rollup/plugin-yaml";
import { defineConfig } from "vite";
import relay from "vite-plugin-relay";
import svgr from "vite-plugin-svgr";

import { paellaSkin } from "./vite-plugins/paellaSkin.mts";
import { translationTypes } from "./vite-plugins/translationTypes.mts";


export default defineConfig(({ mode }) => ({
    base: "/~assets/",
    input: "src/index.tsx",
    publicDir: "static",

    plugins: [
        svgr({ svgrOptions: { icon: true } }),
        translationTypes(),
        paellaSkin(),
        yaml(),
        relay,
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
