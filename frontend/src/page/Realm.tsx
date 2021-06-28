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


export const RealmRoute: Route<PreloadedQuery<RealmQuery>> = {
    path: "/r/*",
    prepare: params => loadQuery(relayEnv, query, { path: `/${params.wild}` }),
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
        // TODO: that should obviously be handled in a better way
        //   Also: I'm not sure whether that's still the only cause for error.
        return <b>{"Realm path not found :("}</b>;
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
            link: `/r${path}`,
        }));

    const navItems = realm.children.length > 0
        ? realm.children.map(({ id, path, name }) => ({
            id,
            label: name,
            link: `/r${path}`,
            active: false,
        }))
        : realm.parent.children.map(({ id, name, path }) => ({
            id,
            label: name,
            link: `/r${path}`,
            active: id === realm.id,
        }));

    return (
        <Root nav={{ items: navItems }}>
            <div><Breadcrumbs path={breadcrumbs} /></div>
            <h1 css={{ margin: "12px 0" }}>{realm.name}</h1>
            <Blocks realm={realm} />
        </Root>
    );
};
