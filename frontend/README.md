Tobira Frontend
==============


Building the Tobira Frontend
---------------------------

Use NPM to get all necessary dependencies and to build the Tobira frontend:

```sh
npm ci
npx relay-compiler
npm run build:dev
```

This assumes that the GraphQL schema of the API provided by the backend
is exported to `build/schema.graphql`. See also [here](../backend/README.md).
The `relay-compiler` needs to be run whenever the schema or any of the queries change,
and it needs to be run before the actual build.
If you want to typecheck your code, it also needs to be run before that.
