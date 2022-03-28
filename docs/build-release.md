# Build Tobira (release build for production use)

This document describes how you can build Tobira in order to use it.
This is also how official releases will be created.
This is primarily targeted at users of Tobira.
If you are a developer, [the development workflow document](./dev-workflow.md) is likely more important to you.


## 1. Install Prerequisites

See [this document](./prerequisites.md) for information on this step.


## 2. Build frontend

Switch to the `frontend` directory and run the following commands:

```sh
npm ci                                      # Download dependencies
npx relay-compiler                          # Compile GraphQL queries
npx webpack --progress --mode=production    # Bundle & optimize everything
```


## 3. Build backend (deployable binary)

Switch to the `backend` directory and run the following command:

```sh
cargo build --release
```

This builds the backend, embeds all required frontend files and produces the final binary `backend/target/release/tobira`.
This is a (mostly) stand-alone binary that you can simply deploy to your server.
To reduce the size of the binary, you should run `objcopy --compress-debug-sections tobira`.
This has no disadvantages.
You probably don't want to `strip tobira`: this removes all debug information, making it harder to investigate any potential crashes/bugs.

To actually run Tobira, you still need to provide a valid configuration and related files (e.g. a logo).
For that and more, see [the deployment docs](./deploy.md).
