"use strict";

const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const path = require("path");
const { APP_PATH, OUT_PATH, STATIC_PATH } = require("./constants");
const plyrDistPath = path.join(__dirname, "node_modules", "plyr", "dist");

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
            test: /\.svg$/u,
            use: [{
                loader: "@svgr/webpack",
                options: {
                    icon: true,
                },
            }],
        }, {
            test: /\.css$/u,
            loader: "css-loader",
        }],
    },

    plugins: [
        new CleanWebpackPlugin(),
        new HtmlWebpackPlugin({
            inject: false,
            template: path.join(APP_PATH, "index.html"),
        }),
        new CopyPlugin({
            patterns: [
                { from: path.join(APP_PATH, "fonts.css"), to: path.join(OUT_PATH) },
                { from: STATIC_PATH, to: OUT_PATH },
                { from: path.join(plyrDistPath, "blank.mp4"), to: OUT_PATH },
                { from: path.join(plyrDistPath, "plyr.svg"), to: OUT_PATH },
            ],
        }),
    ],

    devtool: "hidden-source-map",
});
