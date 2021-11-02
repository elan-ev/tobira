import { Translation, useTranslation } from "react-i18next";
import React, { ReactNode } from "react";

import { APIError, NetworkError, NotJson, ServerError } from ".";
import { Root } from "../layout/Root";
import { RoutingContext } from "../router";
import { Card } from "../ui/Card";
import { assertNever, bug } from "../util/err";
import { match } from "../util";


type Props = {
    children: ReactNode;
};

type HandledError = NetworkError | ServerError | APIError | NotJson;

type State = {
    error?: HandledError;
};

export class GraphQLErrorBoundary extends React.Component<Props, State> {
    public declare context: React.ContextType<typeof RoutingContext>;
    public static contextType = RoutingContext;

    public constructor(props: Props, context: React.ContextType<typeof RoutingContext>) {
        super(props, context);

        const initialState = { error: undefined };
        this.state = initialState;

        // Reset this state whenever the route changes.
        if (this.context === null) {
            return bug("API error boundary not child of router!");
        }
        this.context.listen(() => this.setState(initialState));
    }

    public static getDerivedStateFromError(error: unknown): State {
        if (error instanceof NetworkError
            || error instanceof ServerError
            || error instanceof NotJson
            || error instanceof APIError) {
            return { error };
        }

        // Not our problem
        return { error: undefined };
    }

    public render(): ReactNode {
        const error = this.state.error;
        if (!error) {
            return this.props.children;
        }

        return (
            <Root nav={[]}>
                <Translation>{t => (
                    <div css={{ margin: "0 auto", maxWidth: 600 }}>
                        <MainErrorMessage error={error} />
                        <p css={{ marginBottom: 16, marginTop: "min(150px, 12vh)" }}>
                            {t("api.error-boundary.detailed-error-info")}
                        </p>
                        <div css={{
                            backgroundColor: "var(--grey97)",
                            borderRadius: 4,
                            padding: 16,
                            fontSize: 14,
                        }}>
                            <pre>
                                <code css={{ whiteSpace: "pre-wrap" }}>
                                    {error.toString()}
                                </code>
                            </pre>
                        </div>
                    </div>
                )}</Translation>
            </Root>
        );
    }
}

type MainErrorMessageProps = {
    error: HandledError;
};

const MainErrorMessage: React.FC<MainErrorMessageProps> = ({ error }) => {
    const { t, i18n } = useTranslation();

    let message: string | JSX.Element;
    let ourFault = false;
    if (error instanceof NetworkError) {
        message = t("errors.network-error");
    } else if (error instanceof ServerError) {
        // TODO: choose better error messages according to status code
        message = t("api.error-boundary.unexpected-server-error");
        ourFault = true;
    } else if (error instanceof NotJson) {
        message = t("errors.unexpected-response");
        ourFault = true;
    } else if (error instanceof APIError) {
        // OK response, but it contained GraphQL errors.
        const kinds = new Set();
        const messages: string[] = [];
        for (const err of error.errors) {
            const translationKey = err.key ? `api-remote-errors.${err.key}` : null;
            let msg;
            if (translationKey && i18n.exists(translationKey)) {
                msg = t(translationKey);
            } else {
                if (kinds.has(err.kind)) {
                    continue;
                }

                kinds.add(err.kind);

                if (!err.kind) {
                    ourFault = true;
                    msg = t("api.error-boundary.unexpected-server-error");
                } else {
                    msg = match(err.kind, {
                        INTERNAL_SERVER_ERROR: () => {
                            ourFault = true;
                            return t("errors.internal-server-error");
                        },
                        INVALID_INPUT: () => t("api.error-boundary.invalid-input"),
                        NOT_AUTHORIZED: () => t("errors.not-authorized"),
                    });
                }
            }

            messages.push(msg);
        }


        if (messages.length === 0) {
            // This should never happen?
            message = t("api.error-boundary.unexpected-server-error");
            ourFault = true;
        } else if (messages.length === 1) {
            message = messages[0];
        } else {
            // It's not optimal to just show a list of errors, but this case is
            // likely very rare and I prefer an ugly error message over one
            // that omits useful information.
            message = <ul>{messages.map(msg => <li key={msg}>{msg}</li>)}</ul>;
        }
    } else {
        // Typescript unfortunately requires this `else` branch for some reason.
        message = assertNever(error);
    }

    return <>
        <div css={{ textAlign: "center" }}>
            <Card kind="error">{message}</Card>
        </div>
        {ourFault && <p css={{ margin: "24px 0" }}>
            {t("errors.not-your-fault")}
        </p>}
    </>;
};
