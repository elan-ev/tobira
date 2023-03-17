import React, { ReactNode } from "react";
import { useContext } from "react";
import { graphql } from "react-relay/hooks";

import { UserData$data, UserData$key } from "./__generated__/UserData.graphql";


export type UserQueryRef = UserData$key;

/**
 * Information we know about the user:
 *
 * - "unknown": still loading data or it is unknown for an unexpected reason.
 * - "error": error fetching user data.
 * - "none": no user session, i.e. not logged in.
 * - Or a user object if there is a login session.
 */
export type UserState = "unknown" | "error" | "none" | User;

export type User = {
    username: string;
    displayName: string;
    canUpload: boolean;
    canUseStudio: boolean;
    canUseEditor: boolean;
    canCreateUserRealm: boolean;
};

export const isRealUser = (state: UserState): state is User => (
    state !== "unknown" && state !== "error" && state !== "none"
);

const UserContext = React.createContext<UserState>("unknown");

export const useUser = (): UserState => useContext(UserContext);

export type Props = {
    data?: UserData$data["currentUser"] | "error";
    children: ReactNode;
};

export const UserProvider: React.FC<Props> = ({ data, children }) => {
    const user = data === undefined
        ? "unknown" as const
        : data === null
            ? "none" as const
            : data;
    return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
};

export const userDataFragment = graphql`
    fragment UserData on Query {
        currentUser {
            username
            displayName
            canUpload
            canUseStudio
            canUseEditor
            canCreateUserRealm
        }
    }
`;
