import { css, Global } from "@emotion/react";
import React from "react";

import CONFIG from "./config";
import { hexCodeToRgb, rgbToHsl, lighten } from "./util/color";


export const GlobalStyle: React.FC = () => <>
    <Global styles={CSS_RESETS} />
    <Global styles={GLOBAL_STYLE} />
    <Global styles={themeVars()} />
</>;

/**
 * The following is a minimal set of CSS reset rules in order to get rid of
 * browser dependent, inconsistent or unexpected behavior. Parts of this
 * are taken from here: https://github.com/hankchizljaw/modern-css-reset
 * Licensed as MIT, Andy Bell and other contributors
 */
const CSS_RESETS = css({
    // Everything should have box-sizing border-box by default as it's more
    // intuitive and expected.
    "*, *::before, *::after": {
        boxSizing: "border-box",
    },

    // Remove default margins of the most important elements.
    "body, h1, h2, h3, h4, p, li, figure, figcaption, blockquote, dl, dd": {
        margin: 0,
    },

    // Useful body defaults
    body: {
        // It is useful for the body to always span the entire height of the viewport.
        minHeight: "100vh",

        // This only affects scrolling that "is triggered by the navigation or
        // CSSOM scrolling APIs". For anchors, smooth scrolling is useful.
        scrollBehavior: "smooth",

        // A reset to a sensible value.
        lineHeight: 1.5,
    },

    // This improves the readability of underlines in links.
    a: {
        textDecorationSkipInk: "auto",
    },

    // Some elements not inhereting fonts is a really confusing browser default.
    "input, button, textarea, select": {
        font: "inherit",
    },
});

/** This is just styling for Tobira that we want to apply globally. */
const GLOBAL_STYLE = css({
    body: {
        fontFamily: "var(--main-font), sans-serif",
        fontWeight: 400,

        // 16px is a good default body text size according to the internet (TM).
        fontSize: 16,

        // From a set of popular phones, the iPhone 5 has the smallest viewport
        // width: 320px. It does make sense to set a minimum width early on in
        // order to know where we can stop caring.
        minWidth: 320,
    },
    h1: {
        fontSize: 32,
    },
    h2: {
        fontSize: 24,
    },
    a: {
        color: "var(--nav-color)",
        textDecoration: "none",
        "&:hover": {
            color: "var(--nav-color-darker)",
        },
    },
});

/** Setting values from the theme (and ones derived from it) as CSS variables */
const themeVars = () => {
    const theme = CONFIG.theme;

    const nav = hexCodeToRgb(theme.color.navigation);
    const accent = hexCodeToRgb(theme.color.accent);
    const grey = hexCodeToRgb(theme.color.grey50);

    const [navHue, navSat, navLight] = rgbToHsl(nav);
    const [accentHue, accentSat, accentLight] = rgbToHsl(accent);
    const [greyHue, greySat, _] = rgbToHsl(grey);

    const hsl = (base: string, lightness: number): string =>
        `hsl(var(--${base}-hue), var(--${base}-sat), ${lightness}%)`;

    return css({
        ":root": {
            "--header-height": `${theme.headerHeight}px`,
            "--header-padding": `${theme.headerPadding}px`,

            "--nav-hue": 360 * navHue,
            "--nav-sat": `${100 * navSat}%`,
            "--nav-color": hsl("nav", 100 * navLight),
            "--nav-color-darker": hsl("nav", 100 * lighten(navLight, -40)),

            "--accent-hue": 360 * accentHue,
            "--accent-sat": `${100 * accentSat}%`,
            "--accent-color": hsl("accent", 100 * accentLight),

            "--grey-hue": 360 * greyHue,
            "--grey-sat": `${100 * greySat}%`,
            "--grey97": hsl("grey", 97),
            "--grey92": hsl("grey", 92),
            "--grey80": hsl("grey", 80),
            "--grey65": hsl("grey", 65),
            "--grey40": hsl("grey", 40),
        },
    });
};
