import { graphql, useFragment } from "react-relay";
import { Card, unreachable } from "@opencast/appkit";

import { InlinePlayer } from "../player";
import { VideoBlockData$key } from "./__generated__/VideoBlockData.graphql";
import { Title } from "..";
import { useTranslation } from "react-i18next";
import { isSynced, keyOfId } from "../../util";
import { Link } from "../../router";
import { LuArrowRightCircle } from "react-icons/lu";
import { PlayerContextProvider } from "../player/PlayerContext";


type Props = {
    fragRef: VideoBlockData$key;
    basePath: string;
};

export const VideoBlock: React.FC<Props> = ({ fragRef, basePath }) => {
    const { t } = useTranslation();
    const { event, showTitle, showLink } = useFragment(graphql`
        fragment VideoBlockData on VideoBlock {
            event {
                __typename
                ... on NotAllowed { dummy } # workaround
                ... on AuthorizedEvent {
                    id
                    title
                    isLive
                    opencastId
                    created
                    creators
                    metadata
                    description
                    series { title opencastId }
                    syncedData {
                        duration
                        updated
                        startTime
                        endTime
                    }
                    authorizedData {
                        thumbnail
                        tracks { uri flavor mimetype resolution isMaster }
                        captions { uri lang }
                        segments { uri startTime }
                    }
                }
            }
            showTitle
            showLink
        }
    `, fragRef);

    if (event == null) {
        return <Card kind="error">{t("video.deleted-video-block")}</Card>;
    }

    if (event.__typename === "NotAllowed") {
        return <Card kind="error">{t("video.not-allowed-video-block")}</Card>;
    }
    if (event.__typename !== "AuthorizedEvent") {
        return unreachable();
    }

    if (!event.authorizedData) {
        return <>nop</>; // TODO
    }

    return <div css={{ maxWidth: 800 }}>
        {showTitle && <Title title={event.title} />}
        {isSynced(event)
            ? <PlayerContextProvider>
                <InlinePlayer
                    event={{
                        ...event,
                        authorizedData: event.authorizedData,
                    }}
                    css={{ maxWidth: 800 }}
                />
            </PlayerContextProvider>
            : <Card kind="info">{t("video.not-ready.title")}</Card>}
        {showLink && <Link
            to={`${basePath}/${keyOfId(event.id)}`}
            css={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 8,
                marginLeft: "auto",
                width: "fit-content",
                borderRadius: 4,
                outlineOffset: 1,
            }}
        >
            {t("video.link")}
            <LuArrowRightCircle size={18} css={{ marginTop: 1 }} />
        </Link>}
    </div>;
};
