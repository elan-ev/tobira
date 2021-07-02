import React from "react";
import { graphql, loadQuery, usePreloadedQuery } from "react-relay/hooks";
import type { PreloadedQuery } from "react-relay/hooks";

import type { VideoQuery } from "../query-types/VideoQuery.graphql";
import { environment as relayEnv } from "../relay";
import { Player } from "../ui/Player";
import type { Route } from "../router";
import { Root } from "../layout/Root";


export const VideoRoute: Route<PreloadedQuery<VideoQuery>> = {
    path: "/v/:id",
    prepare: params => loadQuery(relayEnv, query, { id: `ev${params.id}` }),
    render: queryRef => <Root><VideoPage queryRef={queryRef} /></Root>,
};

const query = graphql`
    query VideoQuery($id: ID!) {
        event(id: $id) {
            title
            video
            description
        }
    }
`;

type Props = {
    queryRef: PreloadedQuery<VideoQuery>;
};

const VideoPage: React.FC<Props> = ({ queryRef }) => {
    const { event } = usePreloadedQuery(query, queryRef);
    if (!event) {
        return <>
            <h1>Not found</h1>
            <p>The video you are looking for could not be found</p>
        </>;
    }

    const { title, video, description } = event;
    return <>
        <Player mediaUrl={video} />
        <h1>{title}</h1>
        <p>{description}</p>
    </>;
};
