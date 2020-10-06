"use strict";

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
            test: /\.[jt]sx?$/u,
            loader: "babel-loader",
            include: [
                APP_PATH,
                ...argv.mode === "development"
                    ? []
                    : [path.join(__dirname, "node_modules")],
            ],
        }, {
            test: /\.yaml$/u,
            loader: "yaml-loader",
            type: "json",
        }, {
            test: /\.svg$/,
            use: [{
                loader: "@svgr/webpack",
                options: {
                    icon: true,
                },
            }],
        }],
    },

    plugins: [
        new HtmlWebpackPlugin({
            inject: true,
            template: path.join(APP_PATH, "index.html"),
        }),
        new CopyPlugin({
            patterns: [{ from: STATIC_PATH, to: path.join(OUT_PATH, "static") }],
        }),
    ],

    devtool: "source-map",
});
