import React from "react";
import { graphql, loadQuery, usePreloadedQuery } from "react-relay/hooks";
import type { PreloadedQuery } from "react-relay/hooks";

import type { VideoQuery } from "../query-types/VideoQuery.graphql";
import { environment as relayEnv } from "../relay";
import { Player } from "../ui/Player";
import type { Route } from "../router";
import { Root } from "../layout/Root";
import { PATH_SEGMENT_REGEX } from "./Realm";
import { NotFound } from "./NotFound";


export const VideoRoute: Route<PreloadedQuery<VideoQuery>> = {
    path: `((?:/${PATH_SEGMENT_REGEX})*)/v/([a-zA-Z0-9\\-_]+)`,
    // TODO: check if video belongs to realm
    prepare: ([_path, videoId]) => loadQuery(relayEnv, query, { id: `ev${videoId}` }),
    render: queryRef => <VideoPage queryRef={queryRef} />,
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
        return <NotFound kind="video" />;
    }

    // TODO
    const nav = { parentLink: null, items: [] };

    const { title, video, description } = event;
    return (
        <Root nav={nav}>
            <Player mediaUrl={video} />
            <h1>{title}</h1>
            <p>{description}</p>
        </Root>
    );
};
