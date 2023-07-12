import { graphql, useFragment } from "react-relay";
import { unreachable } from "@opencast/appkit";

import { InlinePlayer } from "../player";
import { VideoBlockData$key } from "./__generated__/VideoBlockData.graphql";
import { Title } from "..";
import { Card } from "../Card";
import { useTranslation } from "react-i18next";
import { isSynced } from "../../util";


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
                    created
                    syncedData {
                        duration
                        updated
                        startTime
                        endTime
                        thumbnail
                        tracks { uri flavor mimetype resolution isMaster }
                        captions { uri lang }
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
        {isSynced(event)
            ? <InlinePlayer event={event} css={{ maxWidth: 800 }} />
            : <Card kind="info">{t("video.not-ready.title")}</Card>}
    </>;
};
