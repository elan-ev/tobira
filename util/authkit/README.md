# `@opencast/tobira-authkit`: Helper for building your own Tobira auth handler

This library enables you to build your own login handler that can be used with Tobira.
Useful mostly for `auth.mode = "login-proxy"`.
See [this documentation](https://elan-ev.github.io/tobira/setup/auth/login-proxy) for context and more information.

## API

The API is described only very briefly here as all public functions and types are documented in code.
The main entry point (and only non-type export) is `startServer`.

```typescript
import { startServer, LoginCheck } from "@opencast/tobira-authkit";

startServer({
    check: myCheckFunction,
    // ... other options
});

const myCheckFunction: LoginCheck = async ({ userid, password }) => { ... };
```

This starts an HTTP server that handles login requests by eventually calling the provided `check` function.
Said function can either return `"forbidden"` or an object describing the user.
In the latter case, this library will automatically send a `POST /~session` to Tobira.
