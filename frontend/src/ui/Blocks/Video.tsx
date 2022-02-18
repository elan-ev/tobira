import { graphql, useFragment } from "react-relay";

import { Track, Player } from "../player";
import { VideoBlockData$key } from "./__generated__/VideoBlockData.graphql";
import { Title } from "..";
import { Card } from "../Card";
import { useTranslation } from "react-i18next";


type Props = {
    fragRef: VideoBlockData$key;
};

export const VideoBlock: React.FC<Props> = ({ fragRef }) => {
    const { t } = useTranslation();
    const { event } = useFragment(graphql`
        fragment VideoBlockData on VideoBlock {
            event {
                title
                duration
                tracks { uri flavor mimetype resolution }
            }
        }
    `, fragRef);

    if (event === null) {
        return <Card kind="error">{t("video.deleted-video-block")}</Card>;
    }

    return <>
        <Title title={event.title} />
        <Player
            {...event}
            // Relay returns `readonly` objects ...
            tracks={event.tracks as Track[]}
        />
    </>;
};
