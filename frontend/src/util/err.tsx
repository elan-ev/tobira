import { i18n } from "i18next";
import React from "react";
import { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { match } from "@opencast/appkit";

import { APIError, NotJson, ServerError } from "../relay";


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
    causes: Set<ReactNode>;

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
        const causes = new Set<ReactNode>();
        let notOurFault = true;
        for (const err of error.errors) {
            // Use a message fitting to the exact error key, if it is present.
            const translationKey = err.key ? `api-remote-errors.${err.key}` : null;
            if (translationKey && i18n.exists(translationKey)) {
                // @ts-expect-error: Dynamically passed i18next keys need to be typed
                // more strictly than just `string` or `ParseKeys` for the `<Trans>`
                // component.
                const msg = <Trans i18nKey={translationKey} />;
                causes.add(msg);
                continue;
            }

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
                    OPENCAST_UNAVAILABLE: () => {
                        notOurFault = false;
                        return t("errors.opencast-unavailable");
                    },
                    OPENCAST_ERROR: () => {
                        notOurFault = false;
                        return t("errors.opencast-error");
                    },
                });
                causes.add(msg);
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
    const textColor = { color: "var(--color-danger0-bw-inverted, white)" };

    return <>
        <p css={textColor}>
            {failedAction && failedAction + " "}
            {causes.length === 1
                ? <>{causes[0]}{" "}</>
                : <ul>{causes.map((cause, i) => <li key={i}>{cause}</li>)}</ul>
            }
            {info.potentiallyInternetProblem && t("errors.are-you-connected-to-internet")}
        </p>
        {info.probablyOurFault && <p css={{ marginTop: 16, fontSize: 14, ...textColor }}>
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

    public componentDidMount() {
        window.addEventListener("popstate", this.popStateHandler);
    }

    public componentWillUnmount() {
        window.removeEventListener("popstate", this.popStateHandler);
    }

    // When this error boundary is triggered, users instinctively want to go
    // back in the browser, to where no error occured. And that might very well
    // fix the problem. But since the browser knows that prior route was served
    // by the same SPA instance, the browser does not perform a normal
    // navigation, but assumes that the SPA handles it. The `onpopstate` handler
    // of the router is already unmounted, but we need to manually reload the
    // page like this instead.
    private popStateHandler = () => {
        if (this.state.error) {
            location.reload();
        }
    };

    public render(): ReactNode {
        const error = this.state.error;
        if (!error) {
            return this.props.children;
        }

        // TODO: we might want to improve that, as it can result in garbage in some cases, maybe.
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        const errorMsg = error.toString();

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
                        backgroundColor: "var(--color-danger0, #b64235)",
                        color: "var(--color-danger0-bw-inverted, white)",
                        borderRadius: 4,
                        padding: 16,
                    }}>
                        <h1 css={{ marginTop: 0, fontSize: 28 }}>Critical Error</h1>
                        <p css={{ color: "var(--color-danger0-bw-inverted, white)" }}>
                            A critical error has occurred!
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
                                {errorMsg}
                            </code>
                        </pre>
                    </div>
                </div>
            );
        } else {
            return <div css={{
                fontFamily: "var(--main-font), sans-serif",
                height: "100%",
                backgroundColor: "var(--color-neutral10, #333333)",
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
