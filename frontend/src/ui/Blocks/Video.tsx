import { graphql, useFragment } from "react-relay";
import { Card, unreachable } from "@opencast/appkit";

import { InlinePlayer } from "../player";
import { VideoBlockData$data, VideoBlockData$key } from "./__generated__/VideoBlockData.graphql";
import { Title } from "..";
import { useTranslation } from "react-i18next";
import { isSynced, keyOfId } from "../../util";
import { Link } from "../../router";
import { LuCircleArrowRight } from "react-icons/lu";
import { PlayerContextProvider } from "../player/PlayerContext";
import { getSeriesLink, PreviewPlaceholder, useEventWithAuthData } from "../../routes/Video";
import { MetadataSection } from "../../ui/metadata";
import React from "react";

export type BlockEvent = VideoBlockData$data["event"];
export type AuthorizedBlockEvent = Extract<BlockEvent, { __typename: "AuthorizedEvent" }>;

type Props = {
    fragRef: VideoBlockData$key;
    basePath: string;
    realmPath: string;
    edit?: boolean;
};

export const VideoBlock: React.FC<Props> = ({ fragRef, basePath, realmPath, edit }) => {
    const { t } = useTranslation();
    const { event: protoEvent, showTitle, showLink, showMetadata } = useFragment(graphql`
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
                    canWrite
                    hasPassword
                    series { title id opencastId }
                    syncedData {
                        duration
                        updated
                        startTime
                        endTime
                        thumbnail
                    }
                    ... VideoPageAuthorizedData
                }
            }
            showTitle
            showLink
            showMetadata
        }
    `, fragRef);
    const [event, refetch] = useEventWithAuthData(protoEvent);

    if (event == null && edit) {
        return <Card kind="error">{t("video.deleted-block")}</Card>;
    }

    if (event == null) {
        return null;
    }

    if (event.__typename === "NotAllowed") {
        return <Card kind="error">{t("video.not-allowed-block")}</Card>;
    }
    if (event.__typename !== "AuthorizedEvent") {
        return unreachable();
    }

    return <PlayerContextProvider>
        <div css={{ maxWidth: 800 }}>
            {showTitle && <Title title={event.title} />}
            <section aria-label={t("video.video-player")}>
                {event.authorizedData && isSynced(event)
                    ? <InlinePlayer
                        event={{ ...event, authorizedData: event.authorizedData }}
                        css={{ margin: "-4px auto 0" }}
                    />
                    : <PreviewPlaceholder {...{ event, refetch }} />
                }
            </section>

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
                {t("video.details")}
                <LuCircleArrowRight size={18} css={{ marginTop: 1 }} />
            </Link>}

            {showMetadata && <div css={{ marginTop: 16 }}>
                <MetadataSection
                    event={event}
                    valueStyle="inline-bullets"
                    seriesLink={getSeriesLink(event.series, realmPath)}
                />
            </div>}
        </div>
    </PlayerContextProvider>;
};
