import { graphql, useFragment } from "react-relay";
import { Card, match, unreachable } from "@opencast/appkit";

import { InlinePlayer } from "../player";
import { VideoBlockData$data, VideoBlockData$key } from "./__generated__/VideoBlockData.graphql";
import { Title } from "..";
import { useTranslation } from "react-i18next";
import { isSynced, keyOfId, translatedConfig } from "../../util";
import { Link } from "../../router";
import { LuCircleArrowRight } from "react-icons/lu";
import { PlayerContextProvider } from "../player/PlayerContext";
import { PreviewPlaceholder, useEventWithAuthData } from "../../routes/Video";

import { screenWidthAtMost } from "@opencast/appkit";
import { COLORS } from "../../color";
import { CollapsibleDescription } from "../../ui/metadata";

import { BREAKPOINT_MEDIUM } from "../../GlobalStyle";
import { ReactNode } from "react";
import CONFIG from "../../config";
import React from "react";

export type BlockEvent = VideoBlockData$data["event"];
export type AuthorizedBlockEvent = Extract<BlockEvent, { __typename: "AuthorizedEvent" }>;

type Props = {
    fragRef: VideoBlockData$key;
    basePath: string;
    edit?: boolean;
};

export const VideoBlock: React.FC<Props> = ({ fragRef, basePath, edit }) => {
    const { t, i18n } = useTranslation();
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

    const pairs: [string, ReactNode][] = [];

    if (event.metadata.dcterms.language) {
        const languageNames = new Intl.DisplayNames(i18n.resolvedLanguage, { type: "language" });
        const languages = event.metadata.dcterms.language.map(lng => languageNames.of(lng) ?? lng);

        pairs.push([
            t("general.language.language", { count: languages.length }),
            languages.join(", "),
        ]);
    }

    for (const [namespace, fields] of Object.entries(CONFIG.metadataLabels)) {
        const metadataNs = event.metadata[namespace];
        if (metadataNs === undefined) {
            continue;
        }

        for (const [field, label] of Object.entries(fields)) {
            if (field in metadataNs) {
                const translatedLabel = typeof label === "object"
                    ? translatedConfig(label, i18n)
                    : match(label, {
                        "builtin:license": () => t("video.license"),
                        "builtin:source": () => t("video.source"),
                    });
                const values = metadataNs[field];
                const node = values.length > 1
                    ? <ul css={{
                        listStyle: "none",
                        display: "inline-flex",
                        flexWrap: "wrap",
                        margin: 0,
                        padding: 0,
                        "& > li:not(:last-child)::after": {
                            content: "'•'",
                            padding: "0 6px",
                            color: COLORS.neutral40,
                        },
                    }}>
                        {values.map((v, i) => <li key={i}>{v}</li>)}
                    </ul>
                    : values[0] ?? null;

                pairs.push([translatedLabel, node]);
            }
        }
    }


    return <div css={{ maxWidth: 800 }}>
        {showTitle && <Title title={event.title} />}
        <PlayerContextProvider>
            <section aria-label={t("video.video-player")}>
                {event.authorizedData && isSynced(event)
                    ? <InlinePlayer
                        event={{ ...event, authorizedData: event.authorizedData }}
                        css={{ margin: "-4px auto 0" }}
                    />
                    : <PreviewPlaceholder {...{ event, refetch }} />
                }
            </section>
        </PlayerContextProvider>

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
            <div css={{
                display: "flex",
                flexWrap: "wrap",
                gap: 16,
                "> div": {
                    backgroundColor: COLORS.neutral10,
                    borderRadius: 8,
                    [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
                        overflowWrap: "anywhere",
                    },
                },
            }}>
                {event.description && <CollapsibleDescription
                    type="video"
                    description={event.description}
                    creators={event.creators}
                    bottomPadding={40}
                />}
                {pairs.length > 0 && <div css={{
                    flex: "1 200px",
                    alignSelf: "flex-start",
                    padding: "20px 22px",
                }}>
                    <dl css={{
                        display: "grid",
                        gridTemplateColumns: "max-content 1fr",
                        columnGap: 8,
                        rowGap: 6,
                        fontSize: 14,
                        lineHeight: 1.3,
                        "& > dt::after": {
                            content: "':'",
                        },
                        "& > dd": {
                            color: COLORS.neutral60,
                        },
                        "& > li:not(:last-child)::after": {
                            content: "'•'",
                            padding: "0 6px",
                            color: COLORS.neutral40,
                        },
                    }}>
                        {pairs.map(([label, value], i) => <React.Fragment key={i}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                        </React.Fragment>)}
                    </dl>
                </div>}
            </div>
        </div>}
    </div>;
};
