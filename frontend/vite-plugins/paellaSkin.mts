import { viteStaticCopy } from "vite-plugin-static-copy";


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
 * Copies Paella skin to `build/paella/`, which backend serves under `/~assets/paella.
 */
export const paellaSkin = () => viteStaticCopy({
    targets: [
        // `stripBase: true` copies the files without their folders.
        { src: `${PAELLA_SKIN}/theme.json`, dest: "paella", rename: { stripBase: true } },
        { src: `${PAELLA_SKIN}/icons/*`, dest: "paella/icons", rename: { stripBase: true } },
        {
            src: `${PAELLA_SKIN}/theme.css`,
            dest: "paella",
            rename: { stripBase: true },
            transform: theme => {
                if (!theme.includes(PAELLA_FONT_FACE)) {
                    // To guard against updates.
                    throw new Error(
                        "Paella skin CSS changed! Adjust 'vite-plugins/paellaSkin.mts'.",
                    );
                }
                return theme.replace(PAELLA_FONT_FACE, "").replaceAll("font-family: roboto;", "");
            },
        },
    ],
});
