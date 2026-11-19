// Without this, `tsc` fails with "Cannot find module 'prettier'".
//
// The type declarations of `@svgr/core` import the `Options` type from the `prettier` package.
// We don't want to install the whole 10~ish MB library just for that one type, which is
// for an SVGR config option that's not even used by us (`prettierConfig`).
// So, to appease tsc, we declare a `prettier` module here ourselves, containing only that one type.
declare module "prettier" {
    // It doesn't really matter which type it actually has.
    export type Options = unknown;
}
