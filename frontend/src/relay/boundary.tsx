import { Translation } from "react-i18next";
import React, { ReactNode } from "react";

import { APIError, NetworkError, NotJson, ServerError } from ".";
import { Root } from "../layout/Root";
import { RoutingContext } from "../router";
import { Card } from "../ui/Card";
import { bug } from "../util/err";


type Props = {
    children: ReactNode;
};

type State = {
    error: null | NetworkError | ServerError | APIError | NotJson;
};

export class GraphQLErrorBoundary extends React.Component<Props, State> {
    public declare context: React.ContextType<typeof RoutingContext>;
    public static contextType = RoutingContext;

    public constructor(props: Props, context: React.ContextType<typeof RoutingContext>) {
        super(props, context);

        const initialState = { error: null };
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
        return { error: null };
    }

    public render(): ReactNode {
        const error = this.state.error;
        if (error === null) {
            return this.props.children;
        }

        let message: string;
        if (error instanceof NetworkError) {
            message = "graphql.network-error";
        } else if (error instanceof ServerError) {
            // TODO: choose better error messages according to status code
            message = "graphql.server-error";
        } else if (error instanceof NotJson) {
            message = "graphql.server-error";
        } else if (error instanceof APIError) {
            // OK response, but it contained GraphQL errors.
            // It might be a good idea to handle these in more specific error boundaries.
            message = "graphql.api-error";
        }

        return (
            <Root nav={[]}>
                <Translation>{t => (
                    <div css={{ margin: "0 auto", maxWidth: 600 }}>
                        <Card kind="error">
                            {t(message)}
                        </Card>
                        <p css={{ marginBottom: 16, marginTop: "min(150px, 12vh)" }}>
                            {t("graphql.detailed-error-info")}
                        </p>
                        <div css={{
                            backgroundColor: "var(--grey97)",
                            borderRadius: 4,
                            padding: 16,
                            fontSize: 14,
                        }}>
                            <code>{error.toString()}</code>
                        </div>
                    </div>
                )}</Translation>
            </Root>
        );
    }
}
