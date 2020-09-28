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
        rules: {
            "react/prop-types": "off",
            "react/react-in-jsx-scope": "off",
            "@typescript-eslint/no-explicit-any": "off",
        },
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
