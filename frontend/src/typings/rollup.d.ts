// Without this, `tsc` fails with "Cannot find module 'rollup'".
//
// `@rollup/plugin-yaml` is used in `vite.config.mts` and its type declarations import
// the `Plugin` type from the `rollup` package, which we don't have installed.
// To appease tsc, we declare a `rollup` module here ourselves, containing only that one type.
declare module "rollup" {
    export type Plugin = import("vite").Rollup.Plugin;
}
