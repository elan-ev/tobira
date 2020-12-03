"use strict";

const noUnusedVarsOptions = {
    args: "all",
    argsIgnorePattern: "^_",
    caughtErrors: "all",
    caughtErrorsIgnorePattern: "^_",
};

// eslint quote-props: "warn", "consistent-as-needed"
module.exports = {
    parserOptions: {
        ecmaVersion: 11,
    },
    extends: [
        "eslint:all",
    ],
    rules: {
        // Turn off or reconfigure some rather opinionated and intrusive rules
        "max-statements": "off",
        "no-warning-comments": "off",
        "no-ternary": "off",
        "id-length": "off",
        "sort-keys": "off",
        "sort-vars": "off",
        "sort-imports": "off",
        "prefer-named-capture-group": "off",
        "padded-blocks": "off",
        "quote-props": "off",
        "no-magic-numbers": "off",
        "max-lines-per-function": "off",
        "default-case": "off",
        "no-console": "off",
        "func-style": "off",
        "space-before-function-paren": ["warn", {
            "anonymous": "always",
            "named": "never",
            "asyncArrow": "always",
        }],
        "no-inline-comments": "off",
        "prefer-destructuring": "off",
        "no-shadow": "off",
        "newline-per-chained-call": "off",
        // `== null` is actually a useful check for `null` and `undefined` at the same time
        "no-eq-null": "off",
        "eqeqeq": ["error", "always", { null: "ignore" }],
        // Everything this protects against is already covered by
        // - `no-shadow-restricted-names`
        // - `strict`
        "no-undefined": "off",
        "no-void": ["error", { allowAsStatement: true }],

        // Style lints should only `"warn"`
        "one-var": ["warn", "never"],
        "spaced-comment": "warn",
        "multiline-comment-style": ["warn", "separate-lines"],
        "capitalized-comments": ["warn", "always", {
            ignoreInlineComments: true,
            ignoreConsecutiveComments: true,
        }],
        "comma-dangle": ["warn", "always-multiline"],
        "array-bracket-newline": ["warn", "consistent"],
        "array-bracket-spacing": "warn",
        "object-curly-spacing": ["warn", "always"],
        "computed-property-spacing": "warn",
        "space-in-parens": "warn",
        "comma-spacing": "warn",
        "comma-style": "warn",
        "operator-linebreak": "warn",
        "space-infix-ops": "warn",
        "keyword-spacing": "warn",
        "space-unary-ops": "warn",
        "func-call-spacing": "warn",
        "function-call-argument-newline": ["warn", "consistent"],
        "function-paren-newline": ["warn", "consistent"],
        "object-property-newline": ["warn", {
            allowAllPropertiesOnSameLine: true,
        }],
        "array-element-newline": ["warn", "consistent"],
        "key-spacing": "warn",
        "brace-style": "warn",
        "rest-spread-spacing": "warn",
        "indent": ["warn", 4, { SwitchCase: 1 }],
        "semi": "warn",
        "no-extra-semi": "warn",
        "semi-spacing": "warn",
        "quotes": ["warn", "double", { avoidEscape: true }],
        "block-spacing": "warn",
        "lines-between-class-members": "warn",
        "padding-line-between-statements": "warn",
        "arrow-body-style": "warn",
        "multiline-ternary": ["warn", "always-multiline"],
        "max-len": ["warn", { code: 100 }],
        "implicit-arrow-linebreak": "warn",
        "arrow-parens": ["warn", "as-needed"],
        "dot-location": ["warn", "property"],
        "dot-notation": "warn",
        "no-tabs": "warn",
        "no-extra-parens": "warn",
        // Unused things should also only warn
        "no-unused-vars": ["warn", noUnusedVarsOptions],
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
            "plugin:@typescript-eslint/all",
            "plugin:react/recommended",
        ],
        // TODO We probably need to disable more ESLint rules here, right?
        rules: {
            // Turn off some intrusive rules
            "react/prop-types": "off",
            "react/react-in-jsx-scope": "off",
            "react/display-name": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-use-before-define": "off",
            "@typescript-eslint/typedef": "off",
            "@typescript-eslint/prefer-readonly-parameter-types": "off",
            "@typescript-eslint/no-magic-numbers": "off",
            "@typescript-eslint/explicit-function-return-type": "off",
            "@typescript-eslint/promise-function-async": "off",
            "implicit-arrow-linebreak": "off",
            // The rationale these two/three are based on is mostly out of date
            "@typescript-eslint/prefer-interface": "off",
            "@typescript-eslint/no-type-alias": "off",
            "@typescript-eslint/consistent-type-definitions": "off",

            // Make style issues warnings
            "react/jsx-curly-spacing": ["warn", { children: true }],
            "@typescript-eslint/no-extra-parens": ["warn", "all", { ignoreJSX: "all" }],
            "@typescript-eslint/no-unused-vars": ["warn", noUnusedVarsOptions],
            "@typescript-eslint/comma-spacing": "warn",
            // This checks some more things than `no-unused-vars`,
            // but is less configurable.
            // Note that this is basically like setting `noUnusedLocals` and `noUnusedParameters`
            // in `tsconfig.json`.
            "@typescript-eslint/no-unused-vars-experimental": "warn",
            "@typescript-eslint/semi": "warn",
            "@typescript-eslint/indent": "warn",
            "@typescript-eslint/naming-convention": ["warn", {
                selector: "variable",
                types: ["function"],
                format: ["PascalCase", "camelCase"],
            }],
            "@typescript-eslint/member-delimiter-style": "warn",

            // Turn off base rules overridden by `@typescript-eslint` rules
            "indent": "off",
            "semi": "off",
            "no-unused-vars": "off",
            "no-extra-parens": "off",

            // Change strange defaults.
            "@typescript-eslint/space-before-function-paren": ["warn", {
                "anonymous": "always",
                "named": "never",
                "asyncArrow": "always",
            }],
        },
        settings: {
            react: {
                version: "detect",
            },
        },
    }],
    ignorePatterns: [
        "/build",
        "/src/query-types",
        "!.*",
    ],
};
