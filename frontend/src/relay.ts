import { Environment, Store, RecordSource, Network } from "relay-runtime";

export const environment = new Environment({
    store: new Store(new RecordSource()),
    network: Network.create(({ text: query }, variables) =>
        fetch("/graphql", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, variables }),
        }).then(response => response.json())),
});
