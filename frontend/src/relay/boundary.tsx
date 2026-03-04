import { Translation } from "react-i18next";
import React, { ReactNode } from "react";

import { APIError, NotJson, ServerError } from ".";
import { Root } from "../layout/Root";
import { useRouter } from "../router";
import { Card } from "@opencast/appkit";
import { ErrorDetails, ErrorDisplay, NetworkError } from "../util/err";
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
        let userData: UserProviderProps["data"] = "error";
        if (error instanceof APIError) {
            // Check that the returned object actually has the fields that are
            // expected.
            const isStringArray = (array: unknown): array is readonly string[] =>
                Array.isArray(array) && array.every(element => typeof element === "string");

            const user = error.response?.data?.currentUser as unknown;
            if (typeof user === "object" && user
                && "username" in user && typeof user.username === "string"
                && "displayName" in user && typeof user.displayName === "string"
                && "userRealmHandle" in user && typeof user.userRealmHandle === "string"
                && "canUpload" in user && typeof user.canUpload === "boolean"
                && "canUseStudio" in user && typeof user.canUseStudio === "boolean"
                && "canUseEditor" in user && typeof user.canUseEditor === "boolean"
                && "canCreateUserRealm" in user && typeof user.canCreateUserRealm === "boolean"
                && "canCreateSeries" in user && typeof user.canCreateSeries === "boolean"
                && "canCreatePlaylists" in user && typeof user.canCreatePlaylists === "boolean"
                && "isTobiraAdmin" in user && typeof user.isTobiraAdmin === "boolean"
                && "canFindUnlisted" in user && typeof user.canFindUnlisted === "boolean"
                && "roles" in user && isStringArray(user.roles)
                && "userRole" in user && typeof user.userRole === "string"
            ) {
                // `userData = user` unfortunately doesn't work here as the type
                // of the `user` object is not sufficiently narrowed. Relevant
                // issue: https://github.com/microsoft/TypeScript/issues/42384
                userData = {
                    username: user.username,
                    displayName: user.displayName,
                    userRealmHandle: user.userRealmHandle,
                    canUpload: user.canUpload,
                    canUseStudio: user.canUseStudio,
                    canUseEditor: user.canUseEditor,
                    canCreateUserRealm: user.canCreateUserRealm,
                    canCreateSeries: user.canCreateSeries,
                    canCreatePlaylists: user.canCreatePlaylists,
                    isTobiraAdmin: user.isTobiraAdmin,
                    canFindUnlisted: user.canFindUnlisted,
                    roles: user.roles,
                    userRole: user.userRole,
                };
            }
        }
        // This seems to work, all cases have a nice toString() as far as I can tell.
        const errorMsg = error.toString();
        return (
            <UserProvider data={userData}>
                <Root nav={[]}>
                    <Translation>{t => (
                        <div css={{ margin: "0 auto", maxWidth: 600 }}>
                            <div css={{ display: "flex", justifyContent: "center" }}>
                                <Card kind="error"><ErrorDisplay error={error} /></Card>
                            </div>
                            <ErrorDetails
                                summary={t("errors.detailed-error-info")}
                                body={errorMsg}
                            />
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
