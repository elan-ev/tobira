import * as path from "path";
import { CallableOption } from "webpack-cli";
import YAML from "yaml";
import { CleanWebpackPlugin } from "clean-webpack-plugin";
import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";
import CopyPlugin from "copy-webpack-plugin";
import * as fs from "fs";

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
        // For local appkit development, see this for more details:
        // https://gist.github.com/LukasKalbertodt/382cb53a85fcf6e7d1f5235625c6f4fb
        alias: {
            "react": path.join(__dirname, "node_modules/react"),
            "@emotion/react": path.join(__dirname, "node_modules/@emotion/react"),
        },
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
        // Unfortunately, Typescript cannot natively load YAML files. But we
        // want out translations to be well-typed, so we convert it to JSON
        // here so that `typings/i18next.d.ts` works. We can't use `CopyPlugin`
        // as that uses a hook that is executed too late in the compilation
        // process.
        compiler => {
            compiler.hooks.beforeCompile.tap("ConvertTranslationsPlugin", async () => {
                const file = fs.readFileSync(path.join(APP_PATH, "i18n/locales/en.yaml"));
                const out = JSON.stringify(YAML.parse(file.toString()));
                fs.writeFileSync(path.join(APP_PATH, "i18n/_generatedTranslationTypes.json"), out);
            });
        },
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
                {
                    from: path.join(__dirname, "node_modules", "paella-skins", "skins", "opencast"),
                    to: path.join(OUT_PATH, "paella"),
                },
            ],
        }),
    ],

    devtool: "hidden-source-map",
});

export default config;
