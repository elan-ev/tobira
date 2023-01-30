"use strict";

const noUnusedVarsOptions = {
    args: "all",
    varsIgnorePattern: "^_",
    argsIgnorePattern: "^_",
    caughtErrors: "all",
    caughtErrorsIgnorePattern: "^_",
    ignoreRestSiblings: true,
};
const noUnusedExpressionsOptions = {
    allowTernary: true,
    enforceForJSX: true,
};
const braceStyle = ["warn", "1tbs", { allowSingleLine: true }];
const quoteOptions = ["double", { avoidEscape: true }];

// eslint quote-props: "warn", "consistent-as-needed"
module.exports = {
    parserOptions: {
        ecmaVersion: 11,
    },
    extends: [
        "eslint:recommended",
        "plugin:react-hooks/recommended",
    ],
    rules: {
        // `== null` is actually a useful check for `null` and `undefined` at the same time
        "eqeqeq": ["error", "always", { null: "ignore" }],
        "no-void": ["error", { allowAsStatement: true }],

        // Style lints should only `"warn"`
        "array-bracket-newline": ["warn", "consistent"],
        "array-bracket-spacing": "warn",
        "array-element-newline": ["warn", "consistent"],
        "arrow-body-style": "warn",
        "arrow-parens": ["warn", "as-needed"],
        "block-spacing": "warn",
        "brace-style": braceStyle,
        "camelcase": ["warn", {
            allow: ["\\$key$"],
            ignoreImports: true,
        }],
        "capitalized-comments": ["warn", "always", {
            ignoreInlineComments: true,
            ignoreConsecutiveComments: true,
        }],
        "comma-dangle": ["warn", "always-multiline"],
        "comma-spacing": "warn",
        "comma-style": "warn",
        "computed-property-spacing": "warn",
        "curly": "warn",
        "dot-location": ["warn", "property"],
        "dot-notation": "warn",
        "func-call-spacing": "warn",
        "function-call-argument-newline": ["warn", "consistent"],
        "function-paren-newline": ["warn", "consistent"],
        "implicit-arrow-linebreak": "warn",
        "indent": ["warn", 4, { SwitchCase: 1 }],
        "key-spacing": "warn",
        "keyword-spacing": "warn",
        "lines-between-class-members": "warn",
        "max-len": ["warn", { code: 100 }],
        "max-statements-per-line": "warn",
        "multiline-comment-style": ["warn", "separate-lines"],
        "no-mixed-spaces-and-tabs": "warn",
        "no-multi-spaces": "warn",
        "no-multiple-empty-lines": ["warn", { max: 5 }],
        "no-tabs": "warn",
        "no-unused-vars": ["warn", noUnusedVarsOptions],
        "no-unused-expressions": ["warn", noUnusedExpressionsOptions],
        "object-curly-spacing": ["warn", "always"],
        "object-property-newline": ["warn", {
            allowAllPropertiesOnSameLine: true,
        }],
        "one-var": ["warn", "never"],
        "operator-linebreak": ["warn", "before"],
        "padding-line-between-statements": "warn",
        "quotes": ["warn", ...quoteOptions],
        "rest-spread-spacing": "warn",
        "semi": "warn",
        "semi-spacing": "warn",
        "space-before-function-paren": ["warn", {
            "anonymous": "always",
            "named": "never",
            "asyncArrow": "always",
        }],
        "space-in-parens": "warn",
        "space-infix-ops": "warn",
        "space-unary-ops": "warn",
        "spaced-comment": "warn",
        "no-console": "warn",
        "no-trailing-spaces": "warn",
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
            "plugin:react/recommended",
        ],
        rules: {
            // Turn off some intrusive rules
            "implicit-arrow-linebreak": "off",
            "react/display-name": "off",
            "react/prop-types": "off",
            "react/react-in-jsx-scope": "off",
            "@typescript-eslint/no-empty-function": "off",
            "@typescript-eslint/no-explicit-any": "off",

            // Turn off base rules overridden by `@typescript-eslint` rules
            "indent": "off",
            "lines-between-class-members": "off",
            "no-unused-vars": "off",
            "no-unused-expressions": "off",
            "semi": "off",
            "no-extra-semi": "off",

            "@typescript-eslint/no-unused-vars": ["warn", noUnusedVarsOptions],
            "@typescript-eslint/no-unused-expressions": ["warn", noUnusedExpressionsOptions],

            // Make style issues warnings
            "react/jsx-curly-spacing": ["warn", { children: true }],
            "@typescript-eslint/brace-style": braceStyle,
            "@typescript-eslint/comma-spacing": "warn",
            "@typescript-eslint/explicit-member-accessibility": "warn",
            "@typescript-eslint/indent": [
                "warn",
                4,
                {
                    "ignoredNodes": [
                        "TSUnionType",
                        "TSTypeAliasDeclaration *",
                    ],
                },
            ],
            "@typescript-eslint/member-delimiter-style": "warn",
            "@typescript-eslint/naming-convention": ["warn", {
                selector: "variable",
                types: ["function"],
                format: ["PascalCase", "camelCase"],
            }],
            "@typescript-eslint/object-curly-spacing": ["warn", "always"],
            "@typescript-eslint/quotes": ["warn", ...quoteOptions],
            "@typescript-eslint/semi": "warn",
            "@typescript-eslint/no-extra-semi": "warn",
            "@typescript-eslint/space-before-function-paren": ["warn", {
                "anonymous": "always",
                "named": "never",
                "asyncArrow": "always",
            }],

            "react/no-unknown-property": ["error", { ignore: ["css"] }],
        },
        settings: {
            react: {
                version: "detect",
            },
        },
    }],
    ignorePatterns: [
        "node_modules",
        "/build",
        "/src/**/__generated__",
        "!.*",
    ],
};
