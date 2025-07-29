// Some types for better code readability.
type Milliseconds = number;
type Seconds = number;

/** An Opencast event ID */
type EventId = string;
/** Timestamp in seconds (since UNIX epoch) */
type Timestamp = number;
/** A full JWT */
type Jwt = string;

/** Configuration. See `DEFAULT_CONFIG` for default values! */
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
    getJwts: (eventsIds: EventId[]) => Promise<Map<EventId, Jwt>>;

    /**
     * Minimum time (in seconds) that JWTs still have to be valid for in order
     * for them to be used. JWTs with `exp - cacheMinTokenTimeLeft` in the past
     * are considered stale. Needs to be shorter than the total JWT validity
     * time (configured in the JWT generator), otherwise cached JWTs are never
     * used.
     */
    cacheMinTokenTimeLeft?: Seconds;

    /**
     * Number of milliseconds to wait for other requests in order to batch
     * multiple "get JWT for event" operations. Defaults to a small number, just
     * big enough to batch requests that occur basically at the same time (e.g.
     * on page load or scrolling multiple loading="lazy" images into view). Set
     * to 0 to disable batching.
     */
    batchWindow?: Milliseconds;

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
    cacheMinTokenTimeLeft: 5,
    batchWindow: 3,
    debugLog: false,
} satisfies Partial<Config>;

type FullConfig = Required<Config>;

// For correct TS typing
declare let self: ServiceWorkerGlobalScope;

// Declare experimental APIs not yet supported by all browsers.
declare const URLPattern: {
    new(input: object): unknown;
} | undefined;
type InstallEventExt = ExtendableEvent & {
    addRoutes?: (routes: Array<{
        condition: object;
        source: "network" | "fetch-event";
    }>) => void;
};


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
    self.addEventListener("install", (event: InstallEventExt) => {
        ctx.log("on 'install'");
        self.skipWaiting();

        if (event.addRoutes && URLPattern) {
            ctx.log("static routing supported: registering routes");

            // We only want to only intercept specific requests and default to
            // "network". Earlier rules have higher priority, so we first define
            // what requests to intercept and then have catch-all.
            event.addRoutes([
                {
                    condition: {
                        // As far as I can tell, there is no support for "alternatives" in
                        // the URL pattern API, so we manually construct all possible
                        // origin + prefix combinations. A single regex with that knowledge
                        // could be faster, but it's fine for now.
                        or: ctx.config.trustedOcOrigins.flatMap(origin => (
                            ctx.config.pathPrefixes.map(prefix => ({
                                urlPattern: `${origin}${prefix}*`,
                            }))
                        )),
                    },
                    source: "fetch-event",
                },
                {
                    condition: {
                        urlPattern: new URLPattern({}),
                    },
                    source: "network",
                },
            ]);
        }
    });

    self.addEventListener("activate", e => {
        ctx.log("on 'activate'");
        e.waitUntil(self.clients.claim());
    });

    self.addEventListener("fetch", e => onFetch(e, ctx));
};


const onFetch = (event: FetchEvent, ctx: Context) => {
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
        const cachedJwt = ctx.cache.get(parsed.eventId);
        let jwt;
        if (cachedJwt) {
            ctx.log("using cached JWT for", parsed.eventId);
            jwt = cachedJwt;
        } else {
            jwt = await ctx.getJwt(parsed.eventId);
            if (jwt) {
                ctx.cache.add(parsed.eventId, jwt);
            }
        }

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
        } else {
            ctx.log("No JWT for request for", req.url);
        }
        return fetch(req);
    })());
};


class Context {
    public config: FullConfig;
    public trustedOcOrigins: Set<string>;
    public log: (s: string, ...rest: unknown[]) => void;
    public cache: Cache;
    public batch: null | {
        task: Promise<Map<EventId, Jwt>>;
        eventIds: EventId[];
    } = null;

    public constructor(configIn: Config) {
        this.config = { ...DEFAULT_CONFIG, ...configIn };

        // Check config
        if (this.config.pathPrefixes.some(p => !p.startsWith("/") || !p.endsWith("/"))) {
            throw new Error("config error: pathPrefixes must start and end with '/'");
        }
        if (this.config.batchWindow < 0.0) {
            throw new Error("config error: `batchWindow` must not be negative");
        }
        if (Number.isNaN(this.config.batchWindow) || !Number.isFinite((this.config.batchWindow))) {
            throw new Error("config error: `batchWindow` must be finite and not NaN");
        }

        this.cache = new Cache(this.config);
        this.trustedOcOrigins = new Set(this.config.trustedOcOrigins);
        this.log = this.config.debugLog
            // eslint-disable-next-line no-console
            ? (s: string, ...rest: unknown[]) => console.debug("[TODO] " + s, ...rest)
            : (..._: unknown[]) => {};
    }

    /** Gets a JWT for the event, potentially batching multiple requests. */
    public async getJwt(eventId: EventId): Promise<Jwt | null> {
        let jwts;
        if (this.config.batchWindow <= 0) {
            // If batching is disabled, just immediately fetch.
            this.log("batching disabled, immediately fetching JWT for", eventId);
            jwts = await this.config.getJwts([eventId]);
        } else {
            let batch = this.batch;
            if (batch) {
                this.log("adding to batch:", eventId);
                batch.eventIds.push(eventId);
            } else {
                this.log("starting new batch with", eventId);
                const eventIds = [eventId];
                batch = this.batch = {
                    eventIds,
                    // The promise is simply a sleep for `batchWindow` and then
                    // a fetch.
                    task: new Promise(resolve => {
                        setTimeout(() => {
                            this.log(`fetching batch with ${eventIds.length} events`);
                            // Reset the batch right before we're starting the
                            // fetch so that a new batch can be started. Otherwise,
                            // event IDs added to the batch would be ignored.
                            this.batch = null;
                            this.config.getJwts(eventIds).then(jwts => {
                                resolve(jwts);
                            });
                        }, this.config.batchWindow);
                    }),
                };
            }

            // Awaiting batch task. Meaning all concurrent executions waiting on
            // it will wake up at the same time.
            jwts = await batch.task;
        }

        return jwts.get(eventId) ?? null;
    }
}


/** Caching JWTs for reuse while they are still fresh enough. */
class Cache {
    private cacheMinTokenTimeLeft: Seconds;
    private tokens: Map<EventId, {
        exp: Timestamp;
        token: Jwt;
    }> = new Map();
    private purgePlanned = false;

    public constructor(config: FullConfig) {
        this.cacheMinTokenTimeLeft = config.cacheMinTokenTimeLeft;
    }

    public get(eventId: EventId): Jwt | null {
        const entry = this.tokens.get(eventId);
        if (!entry) {
            return null;
        }
        if (entry.exp < Date.now() / 1000 + this.cacheMinTokenTimeLeft) {
            this.tokens.delete(eventId);
            return null;
        }
        return entry.token;
    }

    public add(eventId: EventId, token: Jwt) {
        const exp = expOfJwt(token);
        const entry = this.tokens.get(eventId);
        if (entry) {
            if (entry.exp < exp) {
                entry.exp = exp;
                entry.token = token;
            }
        } else {
            this.tokens.set(eventId, { exp, token });
        }
        this.planPurge();
    }

    private planPurge() {
        if (!this.purgePlanned) {
            this.purgePlanned = true;
            const nextExp = Math.min(...this.tokens.values().map(entry => entry.exp));
            const msTillStale = 1000 * (nextExp - Date.now() / 1000 - this.cacheMinTokenTimeLeft);
            setTimeout(() => {
                this.purgeStaleEntries();
                this.purgePlanned = false;
                if (this.tokens.size > 0) {
                    this.planPurge();
                }
            }, msTillStale + 500); // Just add 500ms as buffer
        }
    }

    private purgeStaleEntries() {
        const minExp = Date.now() / 1000 + this.cacheMinTokenTimeLeft;
        for (const [key, entry] of this.tokens.entries()) {
            if (entry.exp < minExp) {
                this.tokens.delete(key);
            }
        }
    }
}

/** Extracts the `exp` claim from a JWT, throwing an error if it's not valid. */
const expOfJwt = (jwt: Jwt): Timestamp => {
    // `btoa` uses a different alphabet than JWT, so we need to adjust it.
    const base64 = jwt.split(".")[1].replaceAll("-", "+").replaceAll("_", "/");

    const binString = atob(base64);
    const bytes = Uint8Array.from(binString, m => m.codePointAt(0)!);
    const utf8Json = new TextDecoder().decode(bytes);
    const payload = JSON.parse(utf8Json);

    if (!("exp" in payload) || typeof payload.exp !== "number") {
        throw new Error("JWT does not have valid 'exp' claim");
    }
    return payload.exp;
};

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
