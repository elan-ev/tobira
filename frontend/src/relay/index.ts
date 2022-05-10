import { loadQuery as relayLoadQuery, LoadQueryOptions } from "react-relay";
import type { PreloadableConcreteRequest, PreloadedQuery } from "react-relay";
import { Environment, Store, RecordSource, Network } from "relay-runtime";
import type {
    GraphQLSingularResponse,
    GraphQLTaggedNode,
    OperationType,
    VariablesOf,
} from "relay-runtime";

import { hasErrors, APIError, ServerError, NotJson } from "./errors";
import { NetworkError } from "../util/err";


export const environment = new Environment({
    store: new Store(new RecordSource()),
    network: Network.create(
        async ({ text: query }, variables) => {
            const response = await fetch("/graphql", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query, variables }),
            }).catch(e => { throw new NetworkError(e); });

            if (!response.ok) {
                throw new ServerError(response);
            }

            // Download full response and parse as JSON.
            const text = await response.text()
                .catch(e => { throw new NetworkError(e); });
            let json;
            try {
                json = JSON.parse(text);
            } catch (e) {
                // According to MDN, `JSON.parse` always throws a `SyntaxError`.
                throw new NotJson(e as SyntaxError);
            }

            // TODO I'm not actually sure we really always get a singular response ...
            const gqlResponse = json as GraphQLSingularResponse;
            if (hasErrors(gqlResponse)) {
                throw new APIError(gqlResponse);
            }
            return gqlResponse;
        },
    ),
});

/** Like `loadQuery` from relay, but using our environment */
export function loadQuery<TQuery extends OperationType>(
    preloadableRequest: GraphQLTaggedNode | PreloadableConcreteRequest<TQuery>,
    variables: VariablesOf<TQuery>,
    options?: LoadQueryOptions,
): PreloadedQuery<TQuery> {
    return relayLoadQuery(environment, preloadableRequest, variables, options);
}


/** Extract queried fields from Relay types. Removes internal properties. */
export type Fields<T> = {
    [K in FieldKeys<keyof T>]: T[K];
};
type FieldKeys<T> = T extends ` ${infer _}` ? never : T;


export * from "./errors";
