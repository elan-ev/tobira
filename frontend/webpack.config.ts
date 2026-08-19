import * as path from "path";
import YAML from "yaml";
import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";
import ESLintPlugin from "eslint-webpack-plugin";
import CopyPlugin from "copy-webpack-plugin";
import HtmlWebpackPlugin from "html-webpack-plugin";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { Configuration } from "webpack";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_PATH = path.join(__dirname, "src");
const OUT_PATH = path.join(__dirname, "build");
const PAELLA_PATH = path.join(APP_PATH, "paella");

const config = (_env: unknown, argv: { mode: string }): Configuration => ({
    entry: {
        main: APP_PATH,
        sw: {
            import: "./src/sw/index.ts",
            filename: "~sw.js",
            publicPath: "/",
        },
    },
    context: __dirname,

    output: {
        filename: "bundle.[name].[contenthash].js",
        path: OUT_PATH,
        publicPath: "/~assets/",
        clean: true,
    },
    optimization: {
        // This disables the automatic chunk splitting by webpack. This is only
        // temporary until we use proper code splitting. But for now we only
        // have a few dynamic imports to split certain things manually.
        splitChunks: {
            chunks: () => false,
        },
    },

    watchOptions: {
        ignored: [OUT_PATH, "**/node_modules"],
    },

    resolve: {
        extensions: [".ts", ".tsx", ".js", ".json"],
        // For local appkit development, see this for more details:
        // https://gist.github.com/LukasKalbertodt/382cb53a85fcf6e7d1f5235625c6f4fb
        alias: {
            "react": path.join(__dirname, "node_modules/react"),
            "focus-trap-react": path.join(__dirname, "node_modules/focus-trap-react"),
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
            typescript: {
                mode: "write-references",
            },
            formatter: "basic",
        }),
        new ESLintPlugin({
            extensions: ["ts", "tsx", "js"],
            failOnError: false,
        }),
        new CopyPlugin({
            patterns: [
                { from: path.join(APP_PATH, "fonts.css"), to: path.join(OUT_PATH) },
                { from: path.join(__dirname, "static"), to: OUT_PATH },
                // Our Paella skin: `theme.json` and the icons it wires up.
                {
                    from: PAELLA_PATH,
                    to: path.join(OUT_PATH, "paella"),
                    globOptions: { ignore: ["**/README.md"] },
                },
            ],
        }),
        new HtmlWebpackPlugin({
            template: path.join(APP_PATH, "index.html"),
            chunks: ["main"],
        }),
    ],

    devtool: "source-map",
});

export default config;
