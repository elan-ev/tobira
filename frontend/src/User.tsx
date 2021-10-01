import React, { Suspense } from "react";
import { useContext } from "react";
import { graphql, useFragment } from "react-relay/hooks";

import { UserData$key } from "./query-types/UserData.graphql";


export type UserQueryRef = UserData$key;

export type UserState = "unknown" | "none" | User;

export type User = {
    username: string;
    displayName: string;
    roles: readonly string[];
};

const UserContext = React.createContext<UserState>("unknown");

export const useUser = (): UserState => useContext(UserContext);

type Props = {
    fragRef?: UserQueryRef;
};

export const UserProvider: React.FC<Props> = ({ fragRef, children }) => {
    if (!fragRef) {
        // When there is no fragment reference given, we cannot know the state
        // of the user.
        return <UnknownUserProvider>{children}</UnknownUserProvider>;
    } else {
        // We have a fragment ref, so we will load the user data. But we do not
        // want to suspend here. The header needs to work even if data cannot
        // be loaded or is not loaded yet. So we set the user state
        // to "unknown" until the query is loaded.
        return (
            <Suspense fallback={<UnknownUserProvider>{children}</UnknownUserProvider>}>
                <Impl fragRef={fragRef}>{children}</Impl>
            </Suspense>
        );
    }
};

type ImplProps = {
    fragRef: UserQueryRef;
};

const Impl: React.FC<ImplProps> = ({ fragRef, children }) => {
    const { currentUser } = useFragment(fragment, fragRef);
    const user = currentUser === null
        ? "none"
        : currentUser;
    return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
};

const UnknownUserProvider: React.FC = ({ children }) => (
    <UserContext.Provider value={"unknown"}>{children}</UserContext.Provider>
);

const fragment = graphql`
    fragment UserData on Query {
        currentUser {
            username
            displayName
            roles
        }
    }
`;
