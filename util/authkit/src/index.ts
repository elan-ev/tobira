import http, { IncomingMessage, ServerResponse, STATUS_CODES } from "http";
import querystring from "querystring";
import { TextDecoder } from "util";


/** What the login check returns: either "forbidden" or user info. */
export type LoginOutcome = "forbidden" | {
    username: string;
    displayName: string;
    roles: string[];
    email?: string;
};

/** What the login check gets passed: the data from the login form. */
export type LoginData = {
    userid: string;
    password: string;
};

/** Function that contains the actual login logic. */
export type LoginCheck = (data: LoginData) => Promise<LoginOutcome>;

/** Specifies either a host+port or a Unix socket to listen on/connect to. */
export type HttpLocation =
    | { host: string; port: number; }
    | { socketPath: string; }

/** Options for the login handler server. */
export type ServerOptions = {
    /**
     * Function to check whether a login attempt is successful, i.e. the actual
     * login logic you have to provide.
     */
    check: LoginCheck;

    /** What the server should listen on. Defaults to 127.0.0.1:3091.*/
    listen?: HttpLocation,

    /**
     * How to reach Tobira. On successful logins, `POST /~session` is sent to
     * the specified Tobira. Default: `{ host: "localhost", port: 3080 }`.
     */
    tobira?: HttpLocation;

    /**
     * Called once the server starts listening (e.g. the port is open). If not
     * set, a simple "Listening on: ..." message is printed.
     */
    onListen?: () => void;
};


/**
 * Starts an HTTP server that handles Tobira logins by calling the specified
 * `check` function.
 *
 * While this is only intended for login requests (`POST /~login`), the path of
 * the request is actually completely ignored. This might be convenient for
 * some situations and does not introduce any problems. However, some other
 * conditions are checked:
 * - If method is not POST => 405 Method not allowed
 * - If the "Content-Type" header is missing or does not start
 *   with "application/x-www-form-urlencoded" => 400 Bad request
 * - If the body is not UTF-8 => 400 Bad request
 * - If the body is not a correctly encoded query string with `userid` and
 *   `password` fields exactly once => 400 Bad request
 *
 * If all those checks pass, the `check` function is called with the login data.
 * Depending on what it returns, either "Forbidden" is replied or a user
 * session in Tobira is created and an appropriate response is sent.
 */
export const runServer = async (options: ServerOptions): Promise<void> => (
    new Promise((resolve, reject) => {
        const listen = options.listen ?? {
            host: "127.0.0.1",
            port: 3091,
        };

        const server = http.createServer((req, res) => {
            listener(req, res, options)
                .then(() => res.end())
                .catch(e => {
                    if (e instanceof ErrorResponse) {
                        res.writeHead(e.code);
                        if (e.body) {
                            res.write(e.body);
                        }
                    } else {
                        res.writeHead(StatusCode.INTERNAL_SERVER_ERROR);
                        res.write("Internal server error");
                    }
                    res.end();
                });
        });
        server.on("listening", () => {
            if (options.onListen == null) {
                console.log("Listening on: ", listen);
            } else {
                options.onListen();
            }
        });
        server.on("error", reject);
        server.on("close", resolve);
        if ("socketPath" in listen) {
            server.listen(listen.socketPath);
        } else {
            server.listen(listen.port, listen.host);
        }
    })
);

const USERID_FIELD = "userid";
const PASSWORD_FIELD = "password";

class ErrorResponse {
    code: number;
    body?: string;

    constructor(code: number, body?: string) {
        this.code = code;
        this.body = body;
    }
}

const listener = async (
    req: IncomingMessage,
    res: ServerResponse,
    { check, tobira }: ServerOptions,
) => {
    // Make sure method and content type are correct.
    if (req.method !== "POST") {
        throw new ErrorResponse(StatusCode.METHOD_NOT_ALLOWED);
    }

    if (!req.headers["content-type"]?.startsWith("application/x-www-form-urlencoded")) {
        throw new ErrorResponse(StatusCode.BAD_REQUEST, "incorrect content type");
    }


    // Read full body and make sure it's proper UTF-8.
    const body = await downloadBody(req);
    const decoder = new TextDecoder("utf8", { fatal: true });
    let bodyStr;
    try {
        bodyStr = decoder.decode(body);
    } catch (e) {
        throw new ErrorResponse(StatusCode.BAD_REQUEST, "Request body is not valid UTF-8");
    }


    // Parse body as form data and make sure both expected fields are present.
    const form = querystring.parse(bodyStr);
    const [userid, password] = [USERID_FIELD, PASSWORD_FIELD].map(key => {
        // This can either be a string (if the key is present only once) or an
        // array or `undefined`. We even handle the case of the one element
        // array as the docs don't specify that it can't happen.
        const value = form[key];
        if (typeof value === "string") {
            return value;
        } else {
            if (value?.length !== 1) {
                throw new ErrorResponse(
                    StatusCode.BAD_REQUEST,
                    `field ${key} not present exactly once`,
                )
            }
            return value[0];
        }
    });


    // Actually perform login check and build appropriate response.
    let outcome;
    try {
        outcome = await check({ userid, password });
    } catch(e) {
        console.error("Login check threw an exception: ", e);
        res.writeHead(StatusCode.INTERNAL_SERVER_ERROR);
        return;
    };

    if (outcome === "forbidden") {
        res.writeHead(StatusCode.FORBIDDEN);
    } else {
        const { username, displayName, roles, email } = outcome;
        const b64encode = (s: string) => Buffer.from(s).toString("base64");

        let response: http.IncomingMessage;
        try {
            response = await new Promise((resolve, reject) => {
                const options: http.RequestOptions = {
                    ...(tobira ?? { host: "localhost", port: 3080 }),
                    path: "/~session",
                    method: "POST",
                    headers: {
                        "x-tobira-username": b64encode(username),
                        "x-tobira-user-display-name": b64encode(displayName),
                        "x-tobira-user-roles": b64encode(roles.join(",")),
                        ...email && { "x-tobira-user-email": b64encode(email) },
                    },
                };
                const client = http.request(options);
                client.on("response", resolve);
                client.on("error", reject);
                client.end();
            });
        } catch (e) {
            console.error("Failed to create user session:", e);
            res.writeHead(StatusCode.BAD_GATEWAY);
            return;
        }

        if (response.statusCode !== StatusCode.NO_CONTENT) {
            console.warn("unexpected status code from 'POST /~session'");
        }

        res.writeHead(StatusCode.NO_CONTENT, {
            "set-cookie": response.headers["set-cookie"],
        });
    }
};

const downloadBody = async (req: IncomingMessage): Promise<Buffer> => (
    new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", chunk => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    })
);

// Just to make the code above nicer.
const StatusCode = {
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    FORBIDDEN: 403,
    METHOD_NOT_ALLOWED: 405,
    INTERNAL_SERVER_ERROR: 500,
    BAD_GATEWAY: 502,
};
