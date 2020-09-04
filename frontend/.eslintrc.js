module.exports = {
    parserOptions: {
        ecmaVersion: 11,
    },
    extends: [
        "eslint:recommended",
    ],
    rules: {
        "indent": "error",
        "quotes": ["error", "double", { avoidEscape: true }],
        "semi": "error",
        "comma-dangle": ["error", "always-multiline"],

        // `jsx` is the JSX factory that is imported in all files.
        // Unfortunately, that lint does not understand it is used in JSX
        // expressions, so we have to ignore that specific variable.
        "@typescript-eslint/no-unused-vars": ["error", { "varsIgnorePattern": "^jsx$" }],
    },
    overrides: [{
        files: ["./*"],
        env: {
            node: true,
        },
    }, {
        files: ["src/**/*.ts{,x}"],
        parser: "@typescript-eslint/parser",
        parserOptions: {
            tsconfigRootDir: __dirname,
            project: "./tsconfig.json",
        },
        extends: [
            "plugin:@typescript-eslint/recommended",
            "plugin:@typescript-eslint/recommended-requiring-type-checking",
            "plugin:react/recommended",
        ],
        settings: {
            react: {
                version: "detect",
            },
        },
    }],
    ignorePatterns: [
        "/build",
        "!.*",
    ],
};
