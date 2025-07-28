import { setUpServiceWorker } from "./lib";

// TODO: batch this
const fetchJwts = async (eventIds: string[]): Promise<Map<string, string>> => {
    const out = new Map();
    for (const eventId of eventIds) {
        const jwt = await jwtForEvent(eventId);
        out.set(eventId, jwt);
    }
    return out;
};

/** Fetch JWT for the given Opencast event ID from the API. */
const jwtForEvent = async (eventId: string): Promise<string | null> => {
    const body = JSON.stringify({
        query: "query($ev: String!) { eventByOpencastId(id:$ev) { ...on AuthorizedEvent { jwt } }}",
        variables: {
            ev: eventId,
        },
    });
    const response = await fetch("/graphql", {
        method: "POST",
        body,
        headers: {
            "Content-Type": "application/json",
        },
    });
    if (response.status !== 200) {
        return null;
    }
    const data = await response.json();
    return data?.data?.eventByOpencastId?.jwt;
};

setUpServiceWorker({
    getJwts: fetchJwts,
    trustedOcOrigins: ["http://localhost:4050"], // TODO
});
