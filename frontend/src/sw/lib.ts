export type Config = {
    /**
     * All origins that serve static Opencast files. Requests with different
     * hosts are ignored. Note: only specify hosts you trust! While JWTs passed
     * to those hosts do not contain secrets, a MitM could use the JWTs to
     * access static files. Example: `["https://oc.example.com"]`.
     */
    trustedOcOrigins: string[];

    /**
     * List of possible path prefixes that should be handled. For most Opencast
     * systems, the default `["/static/"]` is fine.
     *
     * This corresponds to `org.opencastproject.download.url` in `custom.properties`
     * or `org.opencastproject.distribution.aws.s3.distribution.base` in
     * `org.opencastproject.distribution.aws.s3.AwsS3DistributionServiceImpl.cfg`.
     *
     * Must start and end with `/`.
     */
    pathPrefixes?: string[];

    /**
     * Callback to retrieve JWTs for events. This would usually be a fetch
     * request to your backend server which holds the private key to sign the
     * JWTs. That route would need to perform authorization, usually by checking
     * the session cookie.
     *
     * Argument is a list of Opencast IDs (of events). Must return a `Map` that
     * maps from Opencast event IDs to JWTs. Usually the map contains one entry
     * per entry in `eventIds`, but if access to an event should not be granted,
     * don't include a JWT for that event. The function takes multiple event IDs
     * to allow batching (to reduce number of API requests).
     */
    getJwts: (eventsIds: string[]) => Promise<Map<string, string>>;

    /**
     * Whether modified requests should use `mode: "cors"`. This is required
     * when they are cross origin (i.e. different domain). If you can disable
     * it, do it as it saves some requests. But for most it's likely required,
     * thus the default is `true`.
     */
    cors?: boolean;

    /** If `true`, this library emits debugging logs via `console.debug`. */
    debugLog?: boolean;
};

/** Configuration defaults. */
export const DEFAULT_CONFIG = {
    pathPrefixes: ["/static/"],
    cors: true,
    debugLog: false,
} satisfies Partial<Config>;

type FullConfig = Required<Config>;

// For correct TS typing
declare let self: ServiceWorkerGlobalScope;

/**
 * Sets up the service worker to intercept & authenticate OC requests. Usually,
 * you only have to call this in your service worker. Adds the `install`,
 * `activate` and `fetch` event handlers. If you need more manual control over
 * those handlers, use `onFetch`.
 */
export const setUpServiceWorker = (configIn: Config) => {
    const ctx = new Context(configIn);

    // Make sure a downloaded service worker is immediately activated and starts
    // controlling all clients (pages).
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (e: ExtendableEvent) => e.waitUntil(self.clients.claim()));

    self.addEventListener("fetch", e => onFetchImpl(e, ctx));
};

const onFetchImpl = (event: FetchEvent, ctx: Context) => {
    ctx.log("on 'fetch' for ", event.request.method, event.request.url);
    const url = new URL(event.request.url);
    if (!ctx.trustedOcOrigins.has(url.origin)) {
        return;
    }

    // If the path is not one we recognize, we don't change the request.
    const parsed = parsePath(url.pathname, ctx.config);
    if (!parsed) {
        return;
    }

    // Inject JWT
    event.respondWith((async () => {
        const jwts = await ctx.config.getJwts([parsed.eventId]);
        const jwt = jwts.get(parsed.eventId);

        // If we get a JWT for the event, we inject it into the request.
        let req = event.request;
        if (jwt) {
            req = new Request(event.request, {
                // We have to use CORS as we set the `Authorization` header for
                // cross origin requests.
                ...ctx.config.cors && { mode: "cors" },
                headers: {
                    ...event.request.headers,
                    "Authorization": `Bearer ${jwt}`,
                },
            });
        }
        return fetch(req);
    })());
};


class Context {
    public config: FullConfig;
    public trustedOcOrigins: Set<string>;
    public log: (s: string, ...rest: unknown[]) => void;

    public constructor(configIn: Config) {
        this.config = { ...DEFAULT_CONFIG, ...configIn };

        // Check config
        if (this.config.pathPrefixes.some(p => !p.startsWith("/") || !p.endsWith("/"))) {
            throw new Error("config error: pathPrefixes must start and end with '/'");
        }

        this.trustedOcOrigins = new Set(this.config.trustedOcOrigins);
        this.log = this.config.debugLog
            // eslint-disable-next-line no-console
            ? (s: string, ...rest: unknown[]) => console.debug("[TODO] " + s, ...rest)
            : (..._: unknown[]) => {};
    }
}

type ParsedPath = {
    prefix: string;
    org: string;
    channel: string;
    eventId: string;
    suffix: string;
};

const parsePath = (path: string, config: FullConfig): ParsedPath | null => {
    const prefix = config.pathPrefixes.find(prefix => path.startsWith(prefix));
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
