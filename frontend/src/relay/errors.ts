import type {
    GraphQLSingularResponse,
    GraphQLResponseWithData,
    GraphQLResponseWithoutData,
} from "relay-runtime";


// This module contains custom `Error`-s thrown by our Relay network layer
// which the application logic can use to distinguish between different
// causes of errors, and display useful information about them
// or even (partly) try to recover from then.
// With our current usage of Relay, these will be most useful in error boundaries.

/** A network error while fetching the response. */
export class NetworkError extends Error {
    public inner: Error;

    public constructor(inner: Error) {
        super();
        this.name = "Network Error";
        this.inner = inner;
        this.message = `network error while contacting GraphQL API: ${inner}`;
    }
}

/** When the API returns invalid JSON */
export class NotJson extends Error {
    public inner: Error;

    public constructor(inner: Error) {
        super();
        this.name = "Non-JSON GraphQL Response";
        this.inner = inner;
        this.message = `GraphQL API returned invalid JSON: ${inner}`;
    }
}

/**
 * This error gets thrown if there was an error "below" the layer of GraphQL,
 * i.e. when we didn't even get a response from the API. This can happen if the
 * status code is `4xx` or `5xx`.
 */
export class ServerError extends Error {
    public response: Response;

    public constructor(response: Response) {
        super(response.statusText);
        this.name = "Server Error";
        this.response = response;
    }
}

/**
 * This error is supposed to be thrown whenever the API response contained an
 * `errors` field. This is GraphQL's mechanism to report errors, as opposed to
 * the HTTP status code based reporting of typical REST APIs. This way, GraphQL
 * can even report partial errors (together with a partial response).
 *
 * For us, this is kind of awkward to use, because the Relay hooks never pass
 * these errors to the calling component. With this error, you can at least
 * grab them in an error boundary, though, and you can even get the partial
 * data, if any, because we package it in here. Note, however, that we
 * currently recommend modeling error/partial data situations explicitly
 * instead of relying on this, because of how awkward it would be to pass the
 * partial data to your component from the error boundary. (You would have to
 * extract the Relay query from the rendering logic, so that you can call the
 * latter from both, the component that does the query, and from the error
 * boundary.)
 */
export class APIError extends Error {
    // Note: This is a kind of misleading name.
    // There could still be a `data` field on this.
    public response: GraphQLResponseWithoutData;
    public errors: ApiError[];

    public constructor(response: GraphQLResponseWithoutData) {
        super();
        this.name = "API Error";
        this.response = response;
        this.errors = this.response.errors.map(e => ({
            message: e.message,
            path: (e as any).path,
            kind: (e as any).extensions.kind,
            key: (e as any).extensions.key,
        }));
        this.message = (() => {
            let out = "";
            for (const err of this.errors) {
                out += `\n- ${err.message}`;
                if ((err as any).path) {
                    out += ` (at \`${(err as any).path}\`)`;
                }
            }
            return out;
        })();
    }
}

/** Checks whether the given GraphQL response contains any errors. */
export const hasErrors = (
    response: GraphQLSingularResponse,
): response is GraphQLResponseWithoutData =>
    (response as GraphQLResponseWithData).errors !== undefined;

export type ApiError = {
    message: string;
    path?: string;
    kind?: ErrorKind;
    key?: string;
};

/**
 * Possible kinds of errors that the API can report.
 *
 * This has to be kept in sync with the `ApiErrorKind` in `api/err.rs`!
 */
export type ErrorKind = "INVALID_INPUT" | "NOT_AUTHORIZED" | "INTERNAL_SERVER_ERROR";
