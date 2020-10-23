Tobira Frontend
===============


Building the Tobira Frontend
---------------------------

Use npm to build Tobira's frontend:
This requires the backend-generated GraphQL schema at `src/schema.graphql`.

```sh
npm ci
npx relay-compiler
npm run build:dev
```
