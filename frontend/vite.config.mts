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

    server: {
        // The dev docs point the backend at 5173 (Vite's default) via `TOBIRA_VITE_DEV_SERVER`.
        // See also vite.dev/config/server-options
        strictPort: true,
    },

    resolve: {
        // For local appkit development, see this for more details:
        // https://gist.github.com/LukasKalbertodt/382cb53a85fcf6e7d1f5235625c6f4fb
        dedupe: ["react", "react-dom", "focus-trap-react", "@emotion/react"],
    },

    optimizeDeps: {
        // `jsx-runtime` uses CommonJS, so it needs to be pre bundled.
        // See also https://vite.dev/guide/dep-pre-bundling
        include: ["react/jsx-runtime"],
    },

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
            checks: { moduleLevelDirective: false },
            output: {
                entryFileNames: "bundle.[name].[hash].js",
                chunkFileNames: "bundle.[name].[hash].js",
            },
        },
    },
}));
