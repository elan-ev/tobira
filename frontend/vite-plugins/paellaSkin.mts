import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import type { Plugin } from "vite";


const PAELLA_SKIN = "node_modules/paella-skins/skins/opencast";

/**
 * Paella skin ships their own font and forces it onto the player, but the
 * player should use Tobira's font. So we remove that from its `theme.css`
 * (and don't copy the font files).
 */
const PAELLA_FONT_FACE = `@font-face {
  font-family: roboto;
  src: local('Roboto'),
       url(Roboto-Regular.woff2) format('woff2'),
       url(Roboto-Regular.woff) format('woff'),
       url(Roboto-Regular.ttf) format('truetype');
}`;

/**
 * Copies Paella skin to `build/paella/`, which backend serves under `/~assets/paella`.
 */
export const paellaSkin = (): Plugin => ({
    name: "tobira:paella-skin",
    apply: "build",
    generateBundle() {
        const emit = (fileName: string, source: string | Buffer) =>
            this.emitFile({ type: "asset", fileName, source });
        const read = (file: string) => readFileSync(path.join(PAELLA_SKIN, file));

        emit("paella/theme.json", read("theme.json"));

        for (const icon of readdirSync(path.join(PAELLA_SKIN, "icons"))) {
            emit(`paella/icons/${icon}`, read(`icons/${icon}`));
        }

        const theme = read("theme.css").toString();
        if (!theme.includes(PAELLA_FONT_FACE)) {
            // To guard against updates.
            this.error("Paella skin CSS changed! Adjust 'vite-plugins/paellaSkin.mts'.");
        }
        emit(
            "paella/theme.css",
            theme.replace(PAELLA_FONT_FACE, "").replaceAll("font-family: roboto;", ""),
        );
    },
});
