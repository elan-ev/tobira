import React from "react";
import { graphql, loadQuery, usePreloadedQuery } from "react-relay/hooks";
import type { PreloadedQuery } from "react-relay/hooks";

import type { VideoQuery } from "../query-types/VideoQuery.graphql";
import { environment as relayEnv } from "../relay";
import type { Route } from "../router";
import { Root } from "../layout/Root";
import { PATH_SEGMENT_REGEX } from "./Realm";
import { NotFound } from "./NotFound";
import { navFromQuery } from "../layout/Navigation";
import { VideoBlock } from "../ui/blocks/Video";
import { TextBlock } from "../ui/blocks/Text";
import type { Track } from "../ui/Player";


export const VideoRoute: Route<PreloadedQuery<VideoQuery>> = {
    path: `((?:/${PATH_SEGMENT_REGEX})*)/v/([a-zA-Z0-9\\-_]+)`,
    // TODO: check if video belongs to realm
    prepare: ([realmPath, videoId]) =>
        loadQuery(relayEnv, query, { id: `ev${videoId}`, realmPath }),
    render: queryRef => <VideoPage queryRef={queryRef} />,
};

const query = graphql`
    query VideoQuery($id: ID!, $realmPath: String!) {
        event(id: $id) {
            title
            description
            tracks { uri flavor mimetype resolution }
        }
        realm: realmByPath(path: $realmPath) {
            ... NavigationData
        }
    }
`;

type Props = {
    queryRef: PreloadedQuery<VideoQuery>;
};

const VideoPage: React.FC<Props> = ({ queryRef }) => {
    const { event, realm } = usePreloadedQuery(query, queryRef);

    // TODO: this realm check is useless once we check a video belongs to a realm.
    if (!event || !realm) {
        return <NotFound kind="video" />;
    }

    const { title, tracks, description } = event;
    return (
        <Root navSource={navFromQuery(realm)}>
            <h1>{title}</h1>
            <VideoBlock tracks={tracks as Track[]} />
            {description !== null && <TextBlock content={description} />}
        </Root>
    );
};
