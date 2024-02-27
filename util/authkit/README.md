# `@opencast/tobira-authkit`: Helper for building your own Tobira auth handler

This library enables you to build your own login handler that can be used with Tobira.
Useful mostly for using the login callbacks or for intercepting login requests.
See [the documentation](https://elan-ev.github.io/tobira/next/setup/auth/user/tobira-session) for context and more information.

## API

The API is described only very briefly here as all public functions and types are documented in code.
There are two main entry points: `runLoginCallbackServer` (for `login-callback`) and `runLoginProxyServer` (for intercepting login requests).

```typescript
import { runLoginCallbackServer, LoginCheck } from "@opencast/tobira-authkit";

await runLoginCallbackServer({
    check: myCheckFunction,
    // ... other options
});

const myCheckFunction: LoginCheck = async ({ userid, password }) => { ... };
```

This starts an HTTP server that handles login requests by calling the provided `check` function.
Said function can either return `"forbidden"` or an object describing the user.
