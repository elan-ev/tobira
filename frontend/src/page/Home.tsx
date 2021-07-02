import React from "react";
import { graphql, loadQuery, usePreloadedQuery } from "react-relay/hooks";
import type { PreloadedQuery } from "react-relay/hooks";
import type { HomeQuery } from "../query-types/HomeQuery.graphql";

import { NavMain as MainLayout } from "../layout/NavMain";
import { environment as relayEnv } from "../relay";
import { Blocks } from "../ui/Blocks";
import type { Route } from "../router";
import { Root } from "../layout/Root";


export const HomeRoute: Route<PreloadedQuery<HomeQuery>> = {
    path: "/",
    prepare: () => loadQuery(relayEnv, query, {}),
    render: queryRef => <Root><HomePage queryRef={queryRef} /></Root>,
};

const query = graphql`
    query HomeQuery {
        realm: rootRealm {
            name
            path
            children { id name path }
            ... Blocks_blocks
        }
    }
`;

type Props = {
    queryRef: PreloadedQuery<HomeQuery>;
};

const HomePage: React.FC<Props> = ({ queryRef }) => {
    const { realm } = usePreloadedQuery(query, queryRef);

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
