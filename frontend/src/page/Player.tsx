import React from "react";

import { graphql, useLazyLoadQuery } from "react-relay/hooks";
import { PlayerQuery } from "../query-types/PlayerQuery.graphql";


type Props = {
    id: string;
};

export const PlayerPage: React.FC<Props> = ({ id }) => {
    const { event } = useLazyLoadQuery<PlayerQuery>(
        graphql`
            query PlayerQuery($id: ID!) {
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
        <h1>{title}</h1>
        <video src={video} controls />
        <p>{description}</p>
    </>;
};
