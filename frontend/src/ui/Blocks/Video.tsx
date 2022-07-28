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
                ... on AuthorizedEvent {
                    title
                    isLive
                    syncedData {
                        duration
                        thumbnail
                        tracks { uri flavor mimetype resolution }
                    }
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
    if (event.__typename !== "AuthorizedEvent") {
        return unreachable();
    }

    return <>
        {showTitle && <Title title={event.title} />}
        {event.syncedData
            ? <Player
                {...event}
                duration={event.syncedData.duration}
                // Relay returns `readonly` objects ...
                tracks={event.syncedData.tracks as Track[]}
                isLive={event.isLive}
                coverImage={event.syncedData.thumbnail}
                css={{ width: 800 }}
            />
            : <Card kind="info">{t("video.not-ready.title")}</Card>}
    </>;
};
