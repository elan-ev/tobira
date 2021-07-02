import React from "react";
import { graphql, useLazyLoadQuery } from "react-relay/hooks";
import type { HomeQuery } from "../query-types/HomeQuery.graphql";

import { NavMain as MainLayout } from "../layout/NavMain";
import { Blocks } from "../ui/Blocks";
import type { Route } from "../router";
import { Root } from "../layout/Root";


export const HomeRoute: Route<void> = {
    path: "/",
    prepare: () => {},
    render: () => <Root><HomePage /></Root>,
};

const HomePage: React.FC = () => {
    const { realm } = useLazyLoadQuery<HomeQuery>(graphql`
        query HomeQuery {
            realm: rootRealm {
                name
                path
                children { id name path }
                ... Blocks_blocks
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
            <Blocks realm={realm} />
        </MainLayout>
    );
};
