import { Translation } from "react-i18next";
import React, { ReactNode } from "react";

import { APIError, NotJson, ServerError } from ".";
import { Root } from "../layout/Root";
import { useRouter } from "../router";
import { Card } from "../ui/Card";
import { ErrorDisplay, NetworkError } from "../util/err";
import { RouterControl } from "../rauta";
import { UserProvider, Props as UserProviderProps } from "../User";


type Props = {
    router: RouterControl;
    children: ReactNode;
};

type HandledError = NetworkError | ServerError | APIError | NotJson;

type State = {
    error?: HandledError;
};

class GraphQLErrorBoundaryImpl extends React.Component<Props, State> {
    private unlisten?: () => void;

    public constructor(props: Props) {
        super(props);
        this.state = { error: undefined };
    }

    public componentDidMount() {
        this.unlisten = this.props.router.listenAtNav(() => this.setState({ error: undefined }));
    }

    public componentWillUnmount() {
        this.unlisten?.();
    }

    public static getDerivedStateFromError(error: unknown): State {
        if (error instanceof NetworkError
            || error instanceof ServerError
            || error instanceof NotJson
            || error instanceof APIError) {
            return { error };
        }

        // Not our problem, but still an error, so we throw it up to the next boundary
        throw error;
    }

    public render(): ReactNode {
        const error = this.state.error;
        if (!error) {
            return this.props.children;
        }

        // Try to retrieve user data if we have any.
        let userData: UserProviderProps["data"] = undefined;
        if (error instanceof APIError) {
            // This check is not perfect, as it does not make sure the
            // currentUser has all the fields that are actually expected. But
            // given that this object comes from the API and the API is well
            // defined, we just assume if there is a `currentUser`, it has the
            // correct form.
            userData = error.response?.data?.currentUser;
        }

        return (
            <UserProvider data={userData}>
                <Root nav={[]}>
                    <Translation>{t => (
                        <div css={{ margin: "0 auto", maxWidth: 600 }}>
                            <div css={{ display: "flex", justifyContent: "center" }}>
                                <Card kind="error"><ErrorDisplay error={error} /></Card>
                            </div>
                            <details css={{
                                border: "1px solid var(--grey65)",
                                borderRadius: 4,
                                padding: "6px 8px",
                                marginTop: "min(150px, 12vh)",
                                marginBottom: 16,
                            }}>
                                <summary css={{ cursor: "pointer" }}>
                                    {t("errors.detailed-error-info")}
                                </summary>
                                <pre css={{
                                    backgroundColor: "var(--grey97)",
                                    borderRadius: 4,
                                    padding: "12px 16px",
                                    fontSize: 14,
                                    marginTop: 10,
                                }}>
                                    <code css={{ whiteSpace: "pre-wrap" }}>
                                        {error.toString()}
                                    </code>
                                </pre>
                            </details>
                        </div>
                    )}</Translation>
                </Root>
            </UserProvider>
        );
    }
}

// The actual error boundary is a class component, but we want to use the router
// control (which is only available via hook). So we have this wrapper.
export const GraphQLErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => {
    const router = useRouter();
    return <GraphQLErrorBoundaryImpl router={router}>{children}</GraphQLErrorBoundaryImpl>;
};
