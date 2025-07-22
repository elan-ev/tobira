declare let self: ServiceWorkerGlobalScope;

// Make sure a downloaded service worker is immediately activated and starts
// controlling all clients (pages).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e: ExtendableEvent) => e.waitUntil(self.clients.claim()));


self.addEventListener("fetch", (event: FetchEvent) => {
    // TODO: only run for trusted OC hosts!!
    const url = new URL(event.request.url);
    if (url.origin === self.location.origin) {
        return;
    }

    // If the path is not one we recognize, we don't change the request.
    const parsed = parsePath(url.pathname);
    if (!parsed) {
        return;
    }

    // Inject JWT
    event.respondWith((async () => {
        const jwt = await jwtForEvent(parsed.eventId);
        const req = new Request(event.request, {
            // We have to use CORS as we set the `Authorization` header.
            mode: "cors",
            headers: {
                ...event.request.headers,
                "Authorization": `Bearer ${jwt}`,
            },
        });
        return fetch(req);
    })());
});

// Config
const PATH_PREFIXES = ["/static"];

type ParsedPath = {
    prefix: string;
    org: string;
    channel: string;
    eventId: string;
    suffix: string;
}

const parsePath = (path: string): ParsedPath | null => {
    const prefix = PATH_PREFIXES.find(prefix => path.startsWith(prefix));
    if (!prefix) {
        return null;
    }

    const withoutPrefix = path.slice(prefix.length + 1);
    const parts = withoutPrefix.split("/");
    if (parts.length < 4) {
        return null;
    }

    const [org, channel, eventId, ...suffix] = parts;
    return {
        prefix,
        org,
        channel,
        eventId,
        suffix: suffix.join("/"),
    };
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


export { };
