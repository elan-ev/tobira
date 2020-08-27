const package = require("./package.json");

module.exports = {
    plugins: [
        "relay",
    ],
    presets: [
        ["@babel/preset-env", {
            // Uncomment to see which transformations will be run during the build
            //debug: true,
            targets: package.browserslist,
        }],
        "@babel/preset-typescript",
        "@babel/preset-react",
    ],
};
