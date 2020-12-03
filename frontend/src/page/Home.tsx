import React from "react";
import { graphql, useLazyLoadQuery } from "react-relay/hooks";
import { HomeQuery } from "../query-types/HomeQuery.graphql";

import { NavMain as MainLayout } from "../layout/NavMain";


export const HomePage: React.FC = () => {
    const { realm } = useLazyLoadQuery<HomeQuery>(graphql`
        query HomeQuery {
            realm: rootRealm {
                name
                path
                children { id name path }
            }
        }
    `, {});

    return (
        <MainLayout
            leafNode={false}
            items={realm.children.map(({ id, path, name }) => ({
                id,
                label: name,
                link: `/r${path}`,
                active: false,
            }))}
        >
            <p>Welcome to Tobira :3</p>
            <p>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim
                ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
                aliquip ex ea commodo consequat. Duis aute irure dolor in
                reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla
                pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
                culpa qui officia deserunt mollit anim id est laborum.
            </p>
        </MainLayout>
    );
};
