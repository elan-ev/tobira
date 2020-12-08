import { Environment, Store, RecordSource, Network } from "relay-runtime";

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
                throw new APIError(response);
            }
            return response.json();
        },
    ),
});

export class APIError extends Error {
    public response: Response;

    public constructor(response: Response) {
        super(response.statusText);
        this.name = "APIError";
        this.response = response;
    }
}
