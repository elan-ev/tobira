const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const path = require("path");
const { APP_PATH, OUT_PATH, STATIC_PATH } = require("./constants");

module.exports = (_env, argv) => ({
    entry: APP_PATH,

    output: {
        filename: "bundle.js",
        path: OUT_PATH,
        publicPath: "/assets/",
    },

    resolve: {
        extensions: [".ts", ".tsx", ".js", ".json"],
    },

    module: {
        rules: [{
            test: /\.(ts|js)x?$/,
            loader: "babel-loader",
            ... argv.mode === "development" && { exclude: /node_modules/ },
        }],
    },

    plugins: [
        new HtmlWebpackPlugin({ inject: true, template: path.join(APP_PATH, "index.html") }),
        new CopyPlugin({
            patterns: [{ from: STATIC_PATH, to: path.join(OUT_PATH, "static") }],
        }),
    ],

    devtool: "source-map",
});
