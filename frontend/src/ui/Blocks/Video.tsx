import { graphql, useFragment } from "react-relay";

import { Track, Player } from "../player";
import { VideoBlockData$key } from "./__generated__/VideoBlockData.graphql";
import { Title } from "..";
import { Card } from "../Card";
import { useTranslation } from "react-i18next";
import { unreachable } from "../../util/err";


type Props = {
    fragRef: VideoBlockData$key;
};

export const VideoBlock: React.FC<Props> = ({ fragRef }) => {
    const { t } = useTranslation();
    const { event, showTitle } = useFragment(graphql`
        fragment VideoBlockData on VideoBlock {
            event {
                __typename
                ... on NotAllowed { dummy } # workaround
                ... on Event {
                    title
                    duration
                    thumbnail
                    isLive
                    tracks { uri flavor mimetype resolution }
                }
            }
            showTitle
        }
    `, fragRef);

    if (event === null) {
        return <Card kind="error">{t("video.deleted-video-block")}</Card>;
    }

    if (event.__typename === "NotAllowed") {
        return <Card kind="error">{t("video.not-allowed-video-block")}</Card>;
    }
    if (event.__typename !== "Event") {
        return unreachable();
    }

    return <>
        {showTitle && <Title title={event.title} />}
        <Player
            {...event}
            // Relay returns `readonly` objects ...
            tracks={event.tracks as Track[]}
            isLive={event.isLive}
            coverImage={event.thumbnail}
            css={{ width: 800 }}
        />
    </>;
};
