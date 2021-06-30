import React from "react";

import { graphql, loadQuery, usePreloadedQuery } from "react-relay/hooks";
import type { PreloadedQuery } from "react-relay/hooks";
import type { RealmQuery } from "../query-types/RealmQuery.graphql";

import { environment as relayEnv } from "../relay";
import { Breadcrumbs } from "../ui/Breadcrumbs";
import { Blocks } from "../ui/Blocks";
import { unreachable } from "../util/err";
import type { Route } from "../router";
import { Root } from "../layout/Root";
import { NotFound } from "./NotFound";


/** A valid realm path segment */
export const PATH_SEGMENT_REGEX = "[\\p{Alphabetic}\\d][\\p{Alphabetic}\\d\\-]+";

export const RealmRoute: Route<PreloadedQuery<RealmQuery>> = {
    path: `((/${PATH_SEGMENT_REGEX})+)`,
    prepare: ([path]) => loadQuery(relayEnv, query, { path }),
    render: queryRef => <RealmPage queryRef={queryRef} />,
};

// TODO Build this query from fragments!
const query = graphql`
    query RealmQuery($path: String!) {
        realm: realmByPath(path: $path) {
            id
            name
            path
            parents { name path }
            children { id name path }
            parent {
                children { id name path }
                path
            }
            ... Blocks_blocks
        }
    }
`;

type Props = {
    queryRef: PreloadedQuery<RealmQuery>;
};

const RealmPage: React.FC<Props> = ({ queryRef }) => {
    const { realm } = usePreloadedQuery(query, queryRef);

    if (!realm) {
        return <NotFound kind="page" />;
    }

    if (!realm.parent) {
        return unreachable("non root realm has no parent");
    }

    // Prepare data for breadcrumbs
    const breadcrumbs = realm.parents
        .slice(1)
        .concat(realm)
        .map(({ name, path }) => ({
            label: name,
            link: `${path}`,
        }));

    const navItems = realm.children.length > 0
        ? realm.children.map(({ id, path, name }) => ({
            id,
            label: name,
            link: `${path}`,
            active: false,
        }))
        : realm.parent.children.map(({ id, name, path }) => ({
            id,
            label: name,
            link: `${path}`,
            active: id === realm.id,
        }));

    const nav = {
        parentLink: realm.parent.path === "" ? "/" : `${realm.parent.path}`,
        items: navItems,
    };

    return (
        <Root nav={nav}>
            <div><Breadcrumbs path={breadcrumbs} /></div>
            <h1 css={{ margin: "12px 0" }}>{realm.name}</h1>
            <Blocks realm={realm} />
        </Root>
    );
};
