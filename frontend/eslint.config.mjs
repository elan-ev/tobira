import shared from "@opencast/eslint-config-ts-react";
import tseslint from "typescript-eslint";
import compat from "eslint-plugin-compat";

export default [
    ...shared,

    {
        plugins: { compat },
        settings: {
            lintAllEsApis: true,
        },
        rules: {
            // Check browser compatibility using browserslist config
            "compat/compat": "error",

            // Tobira's frontend uses an indentation of 4 to match the backend. In
            // Rust, four spaces is the one style used by basically every code
            // base.
            "indent": ["warn", 4, { SwitchCase: 1 }],

            // Making this stricter
            "max-len": ["warn", { code: 100, ignoreUrls: true }],


            // ----- Additional rules  -------------------------------------------

            // Newlines/linebreaks
            "array-bracket-newline": ["warn", "consistent"],
            "array-element-newline": ["warn", "consistent"],
            "function-call-argument-newline": ["warn", "consistent"],
            "function-paren-newline": ["warn", "consistent"],
            "object-property-newline": ["warn", { allowAllPropertiesOnSameLine: true }],
            "operator-linebreak": ["warn", "before"],

            // Comments
            "capitalized-comments": ["warn", "always", {
                ignoreInlineComments: true,
                ignoreConsecutiveComments: true,
            }],
            "multiline-comment-style": ["warn", "separate-lines"],

            // Other style stuff
            "rest-spread-spacing": "warn",
            "dot-location": ["warn", "property"],
            "dot-notation": "warn",
            "max-statements-per-line": "warn",
            "no-multiple-empty-lines": ["warn", { max: 5 }],
            "arrow-body-style": "warn",
            "one-var": ["warn", "never"],


            // Semantic
            "eqeqeq": ["error", "always", {
                // `== null` is actually a useful check for `null` and `undefined`
                // at the same time
                null: "ignore",
            }],
            "no-void": ["error", { allowAsStatement: true }],
            "no-console": "warn",

            "@typescript-eslint/explicit-member-accessibility": "warn",
            // "@typescript-eslint/member-delimiter-style": "warn", // TODO

            // Disable some lints
            "@typescript-eslint/prefer-promise-reject-errors": "off",

            // Temporarily disable new lints, fix them later
            "@typescript-eslint/no-misused-promises": "off",
            "@typescript-eslint/no-floating-promises": "off",
            "@typescript-eslint/require-await": "off",
            "@typescript-eslint/no-unnecessary-type-assertion": "off",
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-unsafe-return": "off",
            "react-hooks/exhaustive-deps": "off",
        },
    },


    // Fully ignore some files
    {
        ignores: [
            "build/",
            // "node_modules/**",
            "playwright-report/",
            "src/**/__generated__/",
            "*.js",
            ".*.js",
        ],
    },

    // This TS file is not part of the project.
    {
        files: ["webpack.config.ts"],
        ...tseslint.configs.disableTypeChecked,
    },

    // // Config files can make use of Node stuff.
    // {
    //     files: ["./*.js"],
    //     languageOptions: {
    //         globals: {
    //             // ...customGlobals,
    //             // ...globals.browser,
    //             // ...globals.jquery,
    //             ...globals.node,
    //         },
    //     }
    // },

    // Overrides for test files
    {
        files: ["tests/**/*"],
        rules: {
            // Playwright uses fixtures where only destructuring in the arg
            // object already has an effect. We just ignore fixtures that
            // can be used that way.
            "@typescript-eslint/no-unused-vars": ["warn", {
                args: "all",
                varsIgnorePattern: "^_",
                argsIgnorePattern: "^_|standardData|activeSearchIndex",
                caughtErrors: "all",
                caughtErrorsIgnorePattern: "^_",
                ignoreRestSiblings: true,

            }],

            "no-empty-pattern": "off",

            // Playwright tests use tons of async and it's easy to forget
            // writing `await`, which leads to confusing test behavior.
            "@typescript-eslint/no-floating-promises": "error",

            "react-hooks/rules-of-hooks": "off",
        },
    },
];
