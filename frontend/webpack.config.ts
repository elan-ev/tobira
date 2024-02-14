import * as path from "path";
import { CallableOption } from "webpack-cli";
import YAML from "yaml";
import { CleanWebpackPlugin } from "clean-webpack-plugin";
import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";
import CopyPlugin from "copy-webpack-plugin";
import * as fs from "fs";

const APP_PATH = path.join(__dirname, "src");
const OUT_PATH = path.join(__dirname, "build");
const PAELLA_SKIN_PATH = path.join(__dirname, "node_modules", "paella-skins", "skins", "opencast");

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
                { from: PAELLA_SKIN_PATH, to: path.join(OUT_PATH, "paella") },
            ],
        }),
        compiler => {
            compiler.hooks.afterEmit.tap("AdjustPaellaSkinPlugin", async () => {
                const outPath = path.join(OUT_PATH, "paella/theme.css");
                const inPath = path.join(PAELLA_SKIN_PATH, "theme.css");
                const file = fs.readFileSync(inPath).toString();
                if (!file.includes(fontDecl)) {
                    // To guard against updates.
                    throw new Error("Paella skin CSS changed! Adjust webpack config.");
                }
                // @ts-expect-error replaceAll requires a newer es standard, but
                // that's trick to configure for this file.
                const out = file.replace(fontDecl, "").replaceAll("font-family: roboto;", "");
                fs.writeFileSync(outPath, out);
            });
        },
    ],

    devtool: "hidden-source-map",
});

const fontDecl = `@font-face {
  font-family: roboto;
  src: local('Roboto'),
       url(Roboto-Regular.woff2) format('woff2'),
       url(Roboto-Regular.woff) format('woff'),
       url(Roboto-Regular.ttf) format('truetype');
}`;

export default config;
