import React from "react";
import { graphql, usePreloadedQuery } from "react-relay/hooks";
import type { PreloadedQuery } from "react-relay/hooks";
import type { HomeQuery } from "../query-types/HomeQuery.graphql";

import { loadQuery } from "../relay";
import { Blocks } from "../ui/Blocks";
import type { Route } from "../router";
import { Root } from "../layout/Root";


export const HomeRoute: Route<PreloadedQuery<HomeQuery>> = {
    path: "/",
    prepare: () => loadQuery(query, {}),
    render: queryRef => <HomePage queryRef={queryRef} />,
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

    const nav = {
        parentLink: null,
        items: realm.children.map(({ id, path, name }) => ({
            id,
            label: name,
            link: `/r${path}`,
            active: false,
        })),
    };

    return (
        <Root nav={nav}>
            <Blocks realm={realm} />
        </Root>
    );
};
