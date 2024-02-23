# Changelog

## Unreleased

- Add `userRole` to `LoginOutcome`: this reflects the Tobira change of requiring an explicit unique user role.
- Rename `runServer` to `runLoginProxyServer`
- Make `ServerOptions.listen` mandatory (previously, the default `127.0.0.1:3091` was used).
- Move `ServerOptions.tobira` to new `LoginProxyOptions`.

## v0.1.0

- Added everything.
