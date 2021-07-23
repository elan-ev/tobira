import React from "react";

import { graphql, loadQuery, usePreloadedQuery } from "react-relay/hooks";
import type { PreloadedQuery } from "react-relay/hooks";
import type { RealmQuery } from "../query-types/RealmQuery.graphql";

import { environment as relayEnv } from "../relay";
import { Breadcrumbs } from "../ui/Breadcrumbs";
import { Blocks } from "../ui/Blocks";
import type { Route } from "../router";
import { Root } from "../layout/Root";
import { NotFound } from "./NotFound";
import { navFromQuery } from "../layout/Navigation";


/** A valid realm path segment */
export const PATH_SEGMENT_REGEX = "[\\p{Alphabetic}\\d][\\p{Alphabetic}\\d\\-]+";

export const RealmRoute: Route<PreloadedQuery<RealmQuery>> = {
    path: `((?:/${PATH_SEGMENT_REGEX})*)`,
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
            ancestors { name path }
            parent { id }
            ... Blocks_blocks
            ... NavigationData
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

    const breadcrumbs = realm.ancestors
        .concat(realm)
        .map(({ name, path }) => ({
            label: name,
            link: `${path}`,
        }));

    const isRoot = realm.parent === null;

    return (
        <Root navSource={navFromQuery(realm)}>
            {!isRoot && <>
                <div><Breadcrumbs path={breadcrumbs} /></div>
                <h1>{realm.name}</h1>
            </>}
            <Blocks realm={realm} />
        </Root>
    );
};
