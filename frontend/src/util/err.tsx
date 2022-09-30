import { i18n } from "i18next";
import React from "react";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { APIError, NotJson, ServerError } from "../relay";
import { match } from ".";

/**
 * Make sure that the parameter is `never`. This is particularly useful for
 * enum-like types where you want to make sure you handled all cases. For
 * example:
 *
 * ```
 * type Foo = "anna" | "bob";
 * const x = "anna" as Foo;
 *
 * switch x {
 *     case "anna": ...; break;
 *     case "bob": ...; break;
 *     default: assertNever(x);
 * }
 * ```
 *
 * If you add another variant to that type, the switch statement will fail to
 * compile. This is what we want in most cases! That way, we are notified of all
 * places which we might need to change after adding a new variant.
 */
export const assertNever = (_n: never): never =>
    bug("`assertNever` call was reached, that's a soundness hole in the typesystem :(");

/**
 * A custom error type that represents bugs: errors that are not expected and
 * that cannot be handled. They are caused by a bug in our code and not by the
 * "world" (e.g. any input). Use the helper functions below to throw this error.
 */
export class Bug extends Error {
    public constructor(msg: string) {
        super(`${msg} (this is a bug in Tobira)`);
        this.name = "Bug";
    }
}

/** Throws a `Bug` error. Use this function to signal a bug in the code. */
export const bug = (msg: string): never => {
    throw new Bug(msg);
};

/** Like `bug`, but specifically for code paths that should be unreachable. */
export const unreachable = (msg?: string): never => {
    const prefix = "reached unreachable code";
    throw new Bug(msg === undefined ? prefix : `${prefix}: ${msg}`);
};

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

type ErrorDisplayInfo = {
    /**
     * A list of causes: human readable strings (already translated). Usually
     * contains a single element.
     */
    causes: Set<string>;

    /**
     * If `true`, this error is likely caused by a programming bug or server
     * configuration error: there is nothing the user can do about it.
     */
    probablyOurFault: boolean;

    /**
     * If `true`, indicates that a broken or unstable internet connection of the
     * user might be the problem.
     */
    potentiallyInternetProblem: boolean;
};

export const errorDisplayInfo = (error: unknown, i18n: i18n): ErrorDisplayInfo => {
    const t = i18n.t.bind(i18n);

    if (error instanceof NetworkError) {
        return {
            causes: new Set([t("errors.network-error")]),
            probablyOurFault: false,
            potentiallyInternetProblem: true,
        };
    } else if (error instanceof ServerError) {
        const cause = error.response.status >= 500 && error.response.status < 600
            ? t("errors.internal-server-error")
            : t("errors.unexpected-server-error");

        return {
            causes: new Set([cause]),
            probablyOurFault: true,
            potentiallyInternetProblem: false,
        };
    } else if (error instanceof NotJson) {
        return {
            causes: new Set([t("errors.unexpected-response")]),
            probablyOurFault: true,
            potentiallyInternetProblem: false,
        };
    } else if (error instanceof APIError) {
        // OK response, but it contained GraphQL errors.
        const kinds = new Set();
        const causes = new Set<string>();
        let notOurFault = true;
        for (const err of error.errors) {
            // Use a message fitting to the exact error key, if it is present.
            const translationKey = err.key ? `api-remote-errors.${err.key}` : null;
            if (translationKey && i18n.exists(translationKey)) {
                causes.add(t(translationKey));
            } else {
                // Otherwise, derive an error message from the error kind. We
                // use a set to make sure we only emit each kind-derived error
                // message once.
                if (kinds.has(err.kind)) {
                    continue;
                }

                kinds.add(err.kind);

                // The error kind should always be here. But since we are in an
                // error handler, and something is already wrong, we are
                // careful and handle this case, too.
                if (!err.kind) {
                    notOurFault = false;
                    causes.add(t("errors.unexpected-server-error"));
                } else {
                    const msg = match(err.kind, {
                        INTERNAL_SERVER_ERROR: () => {
                            notOurFault = false;
                            return t("errors.internal-server-error");
                        },
                        INVALID_INPUT: () => t("errors.invalid-input"),
                        NOT_AUTHORIZED: () => t("errors.not-authorized"),
                    });
                    causes.add(msg);
                }
            }
        }


        if (causes.size === 0) {
            // This should never happen?
            return {
                causes: new Set([t("errors.unexpected-server-error")]),
                probablyOurFault: true,
                potentiallyInternetProblem: false,
            };
        } else {
            return {
                causes,
                probablyOurFault: !notOurFault,
                potentiallyInternetProblem: false,
            };
        }
    } else {
        return {
            causes: new Set([t("errors.unknown")]),
            probablyOurFault: true,
            potentiallyInternetProblem: false,
        };
    }
};

type ErrorDisplayProps = {
    failedAction?: string;
} & (
    { info: ErrorDisplayInfo } | { error: unknown }
);

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ failedAction, ...props }) => {
    const { t, i18n } = useTranslation();
    const info = "info" in props ? props.info : errorDisplayInfo(props.error, i18n);
    const causes = Array.from(info.causes);

    return <>
        <p>
            {failedAction && failedAction + " "}
            {causes.length === 1
                ? causes[0] + " "
                : <ul>{causes.map(cause => <li key={cause}>{cause}</li>)}</ul>
            }
            {info.potentiallyInternetProblem && t("errors.are-you-connected-to-internet")}
        </p>
        {info.probablyOurFault && <p css={{ marginTop: 16, fontSize: 14 }}>
            {t("errors.not-your-fault")}
        </p>}
    </>;
};


type GlobalErrorBoundaryState = {
    error?: unknown;
};

type GlobalErrorBoundaryProps = {
    children: ReactNode;
};

export class GlobalErrorBoundary
    extends React.Component<GlobalErrorBoundaryProps, GlobalErrorBoundaryState> {
    public constructor(props: GlobalErrorBoundaryProps) {
        super(props);
        this.state = { error: undefined };
    }

    public static getDerivedStateFromError(error: unknown): GlobalErrorBoundaryState {
        return { error };
    }

    public render(): ReactNode {
        const error = this.state.error;
        if (!error) {
            return this.props.children;
        }

        // We are using English here instead of translated strings in order to
        // have fewer possibilities this component will error itself. If this
        // last error catcher errors, that would be bad. And since users should
        // not see this anyway, I think it's fine. Even if users don't
        // understand English at all, "error" is usually understood and the
        // design should convey most of the information anyway.

        if (window === window.top) {
            return (
                <div css={{
                    margin: "auto",
                    paddingTop: "5vh",
                    width: 400,
                    maxWidth: "95%",
                    fontFamily: "var(--main-font), sans-serif",
                }}>
                    <div css={{
                        backgroundColor: "var(--danger-color, #b64235)",
                        color: "var(--danger-color-bw-contrast, white)",
                        borderRadius: 4,
                        padding: 16,
                    }}>
                        <h1 css={{ marginTop: 0, fontSize: 28 }}>Critical Error</h1>
                        <p>
                            A critical error has occured!
                            The application cannot resume in this state.
                            Please try refreshing the page.
                            If that does not work, please contact your system administrator.
                            Sorry for the inconvenience!
                        </p>
                    </div>
                    <div css={{ marginTop: 32 }}>
                        <h2 css={{ fontSize: 22 }}>Information for developers</h2>
                        <pre>
                            <code css={{ whiteSpace: "pre-wrap" }}>
                                {String(error)}
                            </code>
                        </pre>
                    </div>
                </div>
            );
        } else {
            return <div css={{
                fontFamily: "var(--main-font), sans-serif",
                height: "100%",
                backgroundColor: "var(--grey20, #333333)",
                color: "white",
                padding: 8,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "5%",
                textAlign: "center",
            }}>
                <div>An error occurred in the embedded application</div>
            </div>;
        }
    }
}
