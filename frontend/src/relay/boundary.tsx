import { TFunction } from "i18next";
import React from "react";
import { withTranslation } from "react-i18next";

import { APIError, NetworkError, NotJson, ServerError } from ".";
import { Root } from "../layout/Root";
import { Card } from "../ui/Card";


type Props = {
    t: TFunction;
};

type State = {
    error: null | NetworkError | ServerError | APIError | NotJson;
};

class Boundary extends React.Component<Props, State> {
    public constructor(props: Props) {
        super(props);
        this.state = { error: null };
    }

    public static getDerivedStateFromError(error: unknown) {
        if (error instanceof NetworkError
            || error instanceof ServerError
            || error instanceof NotJson
            || error instanceof APIError) {
            return { error };
        }

        // Not our problem
        return { error: null };
    }

    public render() {
        const { t } = this.props;
        const error = this.state.error;
        if (error === null) {
            return this.props.children;
        }

        let message;
        if (error instanceof NetworkError) {
            message = t("graphql.network-error");
        } else if (error instanceof ServerError) {
            message = t("graphql.server-error");
        } else if (error instanceof NotJson) {
            message = t("graphql.server-error");
        } else if (error instanceof APIError) {
            // OK response, but it contained GraphQL errors.
            // It might be a good idea to handle these in more specific error boundaries.
            message = t("graphql.api-error");
        }

        return (
            <Root nav={[]}>
                <div css={{ margin: "0 auto", maxWidth: 600, textAlign: "center" }}>
                    <Card kind="error">
                        {message}
                    </Card>
                    <p css={{ margin: "32px 0" }}>{t("graphql.detailed-error-info")}</p>
                    <div css={{ backgroundColor: "var(--grey97)", borderRadius: 4, padding: 16 }}>
                        <code>{error.toString()}</code>
                    </div>
                </div>
            </Root>
        );
    }
}

export const GraphQLErrorBoundary = withTranslation()(Boundary);
