import React from "react";
import { useContext } from "react";
import { graphql } from "react-relay/hooks";

import { UserData, UserData$key } from "./__generated__/UserData.graphql";


export type UserQueryRef = UserData$key;

export type UserState = "unknown" | "none" | User;

export type User = {
    username: string;
    displayName: string;
    canUpload: boolean;
    canUseStudio: boolean;
    canUseEditor: boolean;
};

const UserContext = React.createContext<UserState>("unknown");

export const useUser = (): UserState => useContext(UserContext);

export type Props = {
    data?: UserData["currentUser"];
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
        }
    }
`;
