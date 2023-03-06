import * as path from "path";
import { CallableOption } from "webpack-cli";
import { CleanWebpackPlugin } from "clean-webpack-plugin";
import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";
import CopyPlugin from "copy-webpack-plugin";

const APP_PATH = path.join(__dirname, "src");
const OUT_PATH = path.join(__dirname, "build");

const config: CallableOption = (_env, argv) => ({
    entry: APP_PATH,
    context: __dirname,

    output: {
        filename: "[name].bundle.js",
        path: OUT_PATH,
        publicPath: "/~assets/",
    },
    optimization: {
        // This disables the automatic chunk splitting by webpack. This is only
        // temporary until we use proper code splitting. But for now we only
        // have a few dynamic imports to split certain things manually.
        splitChunks: {
            chunks: () => false,
        },
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
            type: "asset/source",
        }],
    },

    plugins: [
        new CleanWebpackPlugin(),
        new ForkTsCheckerWebpackPlugin({
            eslint: {
                files: ["."],
            },
            typescript: {
                mode: "write-references",
            },
            formatter: "basic",
        }),
        new CopyPlugin({
            patterns: [
                { from: path.join(APP_PATH, "index.html"), to: path.join(OUT_PATH) },
                { from: path.join(APP_PATH, "fonts.css"), to: path.join(OUT_PATH) },
                { from: path.join(__dirname, "static"), to: OUT_PATH },
            ],
        }),
    ],

    devtool: "hidden-source-map",
});

export default config;
