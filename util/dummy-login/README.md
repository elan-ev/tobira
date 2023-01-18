# Dummy login handler for developers & test deployments

This script is a login handler that's only useful for developers and test deployments.
It just defines a few fixed dummy users (see at the bottom of `index.ts`).
Since this changes rarely, the built script (`dist/index.js`) is committed so that it can be easily used by the `util/containers`.

Scripts:
- `npm run build`: Produce minified bundled JS file `dist/index.js`.
- `npm run run`: Run script.
