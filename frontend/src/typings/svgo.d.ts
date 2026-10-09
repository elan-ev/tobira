// Without this, `tsc` fails with "Cannot find module 'svgo'".
//
// The type declarations of `@svgr/core` import the `Config` type from the `svgo` package.
// We don't want to install the whole library (even if it's reasonably sized)
// just for that one type, which is for an unused SVGR config option (`svgoConfig`).
// To appease tsc, this declares a dummy `svgo` module here ourselves which contains
// only that one type.
// It doesn't really matter which type it actually has.

declare module "svgo" {
    export type Config = unknown;
}
