import { GraphQLSingularResponse, Environment, Store, RecordSource, Network } from "relay-runtime";

import { hasErrors, APIError, ServerError } from "./errors";


export const environment = new Environment({
    store: new Store(new RecordSource()),
    network: Network.create(
        async ({ text: query }, variables) => {
            const response = await fetch("/graphql", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query, variables }),
            });
            if (!response.ok) {
                throw new ServerError(response);
            }
            // TODO I'm not actually sure we really always get a singular response ...
            const json = await response.json() as GraphQLSingularResponse;
            if (hasErrors(json)) {
                throw new APIError(json);
            }
            return json;
        },
    ),
});

export * from "./errors";
