import { css, jsx, Global } from "@emotion/core";
import React from "react";


export const GlobalStyle: React.FC = () => <>
    <Global styles={CSS_RESETS} />
    <Global styles={GLOBAL_STYLE} />
</>;


// The following is a minimal set of CSS reset rules in order to get rid of
// browser dependent, inconsistent or unexpected behavior. Parts of this
// are taken from here: https://github.com/hankchizljaw/modern-css-reset
// Licensed as MIT, Andy Bell and other contributors
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
    "body": {
        // It is useful for the body to always span the entire height of the viewport.
        minHeight: "100vh",

        // This only affects scrolling that "is triggered by the navigation or
        // CSSOM scrolling APIs". For anchors, smooth scrolling is useful.
        scrollBehavior: "smooth",

        // A reset to a sensible value.
        lineHeight: 1.5,
    },

    // This improves the readability of underlines in links.
    "a": {
        textDecorationSkipInk: "auto",
    },

    // Useful default resets for images.
    "img": {
        maxWidth: "100%",
        display: "block",
    },

    // Some elements not inhereting fonts is a really confusing browser default.
    "input, button, textarea, select": {
        font: "inherit",
    },
});

// This is just styling for Tobira that we want to apply globally.
const GLOBAL_STYLE = css({
    "body": {
        fontFamily: "'Open Sans', sans-serif",
        fontWeight: 400,
    },
});
