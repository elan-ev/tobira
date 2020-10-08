"use strict";

const manifest = require("./package.json");

module.exports = {
    plugins: [
        "relay",
    ],
    presets: [
        ["@babel/preset-env", {
            // Set to `true` to show which transforms will be run
            // during the build
            debug: false,
            targets: manifest.browserslist,
        }],
        "@babel/preset-typescript",
        "@babel/preset-react",
        "@emotion/babel-preset-css-prop",
    ],
};
