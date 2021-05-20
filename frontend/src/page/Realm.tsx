import React from "react";

import { graphql, useLazyLoadQuery } from "react-relay/hooks";
import type { RealmQuery } from "../query-types/RealmQuery.graphql";

import { Breadcrumbs } from "../ui/Breadcrumbs";
import { Blocks } from "../ui/Blocks";
import { NavMain as MainLayout } from "../layout/NavMain";
import { unreachable } from "../util/err";


type Props = {
    path: string;
};

export const RealmPage: React.FC<Props> = ({ path }) => {
    const isRoot = path === "";

    // TODO Build this query from fragments!
    const { realm } = useLazyLoadQuery<RealmQuery>(graphql`
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
    `, {
        // The API expects a "leading" slash to non-root paths to separate
        // the first component from the root path segment `''`
        path: isRoot ? "" : `/${path}`,
    });

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
        <MainLayout
            title={realm.name}
            breadcrumbs={<Breadcrumbs path={breadcrumbs} />}
            items={navItems}
            leafNode={realm.children.length === 0}
        >
            <Blocks realm={realm} />
        </MainLayout>
    );
};
