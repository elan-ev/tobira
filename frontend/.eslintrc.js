"use strict";

module.exports = {
    extends: ["@opencast/eslint-config-ts-react"],
    rules: {
        // Tobira's frontend uses an indentation of 4 to match the backend. In
        // Rust, four spaces is the one style used by basically every code
        // base.
        "indent": ["warn", 4, { SwitchCase: 1 }],

        // Making this stricter
        "max-len": ["warn", { code: 100 }],


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
        "@typescript-eslint/member-delimiter-style": "warn",
    },

    overrides: [
        // Config files can make use of Node stuff.
        {
            files: ["./*"],
            env: {
                node: true,
            },
        },
        // This TS file is not part of the project.
        {
            files: ["./webpack.config.ts"],
            parserOptions: {
                project: false,
            },
        },
    ],

    ignorePatterns: [
        "node_modules",
        "/build",
        "/src/**/__generated__",
        "!.*",
    ],
};
