import { EventId, setUpServiceWorker } from "./lib";

const fetchJwts = async (eventIds: Set<EventId>): Promise<Map<string, string>> => {
    // We don't use relay here, as it's straight forward to do maually and we
    // don't need to pull in a big dependency for this.
    const response = await fetch("/graphql", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            query: "query($events: [String!]!) { eventReadJwts(events:$events) { event jwt } }",
            variables: {
                events: [...eventIds.keys()],
            },
        }),
    });
    if (response.status !== 200) {
        throw new Error("unexpected non-200 response from API");
    }
    const data = await response.json();

    // Read & convert data, making sure it has the expected format
    const arr = data?.data?.eventReadJwts;
    if (!arr || !Array.isArray(arr)) {
        throw new Error("unexpected API response data");
    }
    const entries = arr.map(elem => {
        if (typeof elem === "object") {
            const { jwt, event } = elem;
            if (typeof jwt === "string" && typeof event === "string") {
                return [event, jwt] as const;
            }
        }
        throw new Error("unexpected API response data (invalid element)");
    });

    return new Map(entries);
};

setUpServiceWorker({
    getJwts: fetchJwts,
    trustedOcOrigins: ["http://localhost:4050"], // TODO
});
