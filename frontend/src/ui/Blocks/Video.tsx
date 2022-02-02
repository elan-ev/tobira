import { graphql, useFragment } from "react-relay";

import { Track, Player } from "../player";
import { VideoBlockData$key } from "./__generated__/VideoBlockData.graphql";
import { Title, BlockContainer } from ".";


type Props = {
    title?: string;
    fragRef: VideoBlockData$key;
};

export const VideoBlock: React.FC<Props> = ({ title, fragRef }) => {
    const { event } = useFragment(graphql`
        fragment VideoBlockData on VideoBlock {
            event {
                title
                duration
                tracks {
                    uri
                    flavor
                    mimetype
                    resolution
                }
            }
        }
    `, fragRef);

    return <BlockContainer>
        {/* TODO The title display logic will change soon */}
        <Title title={title ?? event.title} />
        <Player
            {...event}
            // TODO In the future, duration won't be nullable anymore
            duration={event.duration ?? 0}
            // Relay returns `readonly` objects ...
            tracks={event.tracks as Track[]}
        />
    </BlockContainer>;
};
