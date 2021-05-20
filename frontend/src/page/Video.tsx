import React from "react";
import { graphql, useLazyLoadQuery } from "react-relay/hooks";

import type { VideoQuery } from "../query-types/VideoQuery.graphql";
import { Player } from "../ui/Player";


type Props = {
    id: string;
};

export const VideoPage: React.FC<Props> = ({ id }) => {
    const { event } = useLazyLoadQuery<VideoQuery>(
        graphql`
            query VideoQuery($id: ID!) {
                event(id: $id) {
                    title
                    video
                    description
                }
            }
        `,
        { id: `ev${id}` },
    );
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
