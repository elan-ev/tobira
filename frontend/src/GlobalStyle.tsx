import { css, Global } from "@emotion/react";
import React from "react";

import CONFIG from "./config";
import { bug } from "./util/err";


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
        color: "var(--navigation-color)",
    },
});

type Triplet = [number, number, number];

/**
 * Converts an RGB color to HSL. All components of input and output are between
 * 0 and 1.
 */
const rgbToHsl = ([r, g, b]: Triplet): Triplet => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const range = max - min;

    const l = (max + min) / 2;
    const s = range === 0 ? 0 : range / (1 - Math.abs(2 * l - 1));

    let h;
    if (r === g && g === b) {
        h = 0;
    } else if (r > g && r > b) {
        h = (g - b) / range + (g < b ? 6 : 0);
    } else if (g > b) {
        h = (b - r) / range + 2;
    } else {
        h = (r - g) / range + 4;
    }
    h /= 6;

    return [h, s, l];
};

/**
 * Extracts the RGB values from a six digit hex code with leading `#`. Returned
 * values are between 0 and 1.
 */
const hexCodeToRgb = (hex: string): Triplet => {
    if (hex.length !== 7) {
        bug("invalid color input");
    }

    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    return [r, g, b];
};

/** Setting values from the theme (and ones derived from it) as CSS variables */
const themeVars = () => {
    const [greyHue, greySaturation, _] = rgbToHsl(hexCodeToRgb(CONFIG.theme.grey50));

    return css({
        ":root": {
            "--header-height": `${CONFIG.theme.headerHeight}px`,
            "--header-padding": `${CONFIG.theme.headerPadding}px`,
            "--navigation-color": CONFIG.theme.navigationColor,

            "--grey-hue": 360 * greyHue,
            "--grey-saturation": `${100 * greySaturation}%`,
            "--grey97": "hsl(var(--grey-hue), var(--grey-saturation), 97%)",
            "--grey92": "hsl(var(--grey-hue), var(--grey-saturation), 92%)",
            "--grey80": "hsl(var(--grey-hue), var(--grey-saturation), 80%)",
            "--grey65": "hsl(var(--grey-hue), var(--grey-saturation), 65%)",
            "--grey40": "hsl(var(--grey-hue), var(--grey-saturation), 40%)",
        },
    });
};
