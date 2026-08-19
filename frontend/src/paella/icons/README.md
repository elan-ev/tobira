# Paella player icons

These are wired up to Paella's plugins by `../theme.json` and copied to
`build/paella/icons` by webpack.

All of them except `settings.svg` (which is ours) come from the `opencast` skin
of [`paella-skins`](https://github.com/polimediaupv/paella-skins), which is
licensed under the ECL-2.0 license. We used to depend on that package, but it is
still built for Paella 7: apart from these icons, nothing in it applies to the
version we use. So we copied the ones we need instead. `circle-play.svg` and
`loader-circle.svg` are [lucide](https://lucide.dev) icons (ISC license), which
is also where the rest of Tobira's icons come from.
