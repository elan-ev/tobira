import React, { ReactNode, useRef, useState } from "react";
import { graphql, GraphQLTaggedNode, PreloadedQuery, useFragment } from "react-relay/hooks";
import { useTranslation } from "react-i18next";
import { OperationType } from "relay-runtime";
import { FiCode, FiSettings, FiCrosshair, FiShare2 } from "react-icons/fi";

import { loadQuery } from "../relay";
import { RootLoader } from "../layout/Root";
import { NotFound } from "./NotFound";
import { Nav } from "../layout/Navigation";
import { WaitingPage } from "../ui/Waiting";
import { getPlayerAspectRatio, InlinePlayer } from "../ui/player";
import { SeriesBlockFromSeries } from "../ui/Blocks/Series";
import { makeRoute, MatchedRoute } from "../rauta";
import { isValidPathSegment } from "./Realm";
import { Breadcrumbs } from "../ui/Breadcrumbs";
import { PageTitle } from "../layout/header/ui";
import {
    SyncedOpencastEntity,
    isSynced,
    toIsoDuration,
    useForceRerender,
    translatedConfig,
    match,
    useOnOutsideClick,
} from "../util";
import { unreachable } from "../util/err";
import { BREAKPOINT_SMALL, BREAKPOINT_MEDIUM } from "../GlobalStyle";
import { Button, LinkButton, ProtoButton } from "../ui/Button";
import CONFIG from "../config";
import { Link } from "../router";
import { useUser } from "../User";
import { b64regex } from "./util";
import { ErrorPage } from "../ui/error";
import { CopyableInput } from "../ui/Input";
import { VideoPageInRealmQuery } from "./__generated__/VideoPageInRealmQuery.graphql";
import {
    VideoPageEventData$data,
    VideoPageEventData$key,
} from "./__generated__/VideoPageEventData.graphql";
import { VideoPageRealmData$key } from "./__generated__/VideoPageRealmData.graphql";
import { VideoPageDirectLinkQuery } from "./__generated__/VideoPageDirectLinkQuery.graphql";
import {
    VideoPageDirectOpencastLinkQuery,
} from "./__generated__/VideoPageDirectOpencastLinkQuery.graphql";
import { UserData$key } from "../__generated__/UserData.graphql";
import { NavigationData$key } from "../layout/__generated__/NavigationData.graphql";
import { getEventTimeInfo } from "../util/video";
import { Creators } from "../ui/Video";
import { Description } from "../ui/metadata";
import { ellipsisOverflowCss } from "../ui";
import { Floating, FloatingContainer, FloatingTrigger, WithTooltip } from "../ui/Floating";
import { Card } from "../ui/Card";
import { realmBreadcrumbs } from "../util/realm";
import { VideoObject, WithContext } from "schema-dts";


// ===========================================================================================
// ===== Route definitions
// ===========================================================================================

/** Video in realm route: `/path/to/realm/v/<videoid>` */
export const VideoRoute = makeRoute(url => {
    const urlPath = url.pathname.replace(/^\/|\/$/g, "");
    const parts = urlPath.split("/").map(decodeURIComponent);
    if (parts.length < 2) {
        return null;
    }
    if (parts[parts.length - 2] !== "v") {
        return null;
    }
    const videoId = parts[parts.length - 1];
    if (!videoId.match(b64regex)) {
        return null;
    }

    const realmPathParts = parts.slice(0, parts.length - 2);
    for (const segment of realmPathParts) {
        if (!isValidPathSegment(segment)) {
            return null;
        }
    }

    const query = graphql`
        query VideoPageInRealmQuery($id: ID!, $realmPath: String!) {
            ... UserData
            event: eventById(id: $id) { ... VideoPageEventData }
            realm: realmByPath(path: $realmPath) {
                referencesVideo: references(id: $id)
                ... VideoPageRealmData
                ... NavigationData
            }
        }
    `;
    const realmPath = "/" + realmPathParts.join("/");
    const eventId = `ev${videoId}`;
    const queryRef = loadQuery<VideoPageInRealmQuery>(query, { id: eventId, realmPath });

    return {
        render: () => <RootLoader
            {... { query, queryRef }}
            nav={data => data.realm ? <Nav fragRef={data.realm} /> : []}
            render={({ event, realm }) => !event || !realm || !realm.referencesVideo
                ? <NotFound kind="video" />
                : <VideoPage
                    eventRef={event}
                    realmRef={realm}
                    basePath={realmPath.replace(/\/$/u, "") + "/v"}
                />}
        />,
        dispose: () => queryRef.dispose(),
    };
});

/** Direct link to video with our ID: `/!v/<videoid>` */
export const DirectVideoRoute = makeRoute(url => {
    const regex = new RegExp(`^/!v/(${b64regex}+)/?$`, "u");
    const params = regex.exec(url.pathname);
    if (params === null) {
        return null;
    }

    const query = graphql`
        query VideoPageDirectLinkQuery($id: ID!) {
            ... UserData
            event: eventById(id: $id) { ... VideoPageEventData }
            realm: rootRealm {
                ... VideoPageRealmData
                ... NavigationData
            }
        }
    `;
    const videoId = decodeURIComponent(params[1]);
    const eventId = `ev${videoId}`;
    const queryRef = loadQuery<VideoPageDirectLinkQuery>(query, { id: eventId });

    return matchedDirectRoute(query, queryRef);
});

/** Direct link to video with Opencast ID: `/!v/:<ocid>` */
export const DirectOpencastVideoRoute = makeRoute(url => {
    const regex = new RegExp("^/!v/:([^/]+)$", "u");
    const matches = regex.exec(url.pathname);
    if (!matches) {
        return null;
    }

    const query = graphql`
        query VideoPageDirectOpencastLinkQuery($id: String!) {
            ... UserData
            event: eventByOpencastId(id: $id) { ... VideoPageEventData }
            realm: rootRealm {
                ... VideoPageRealmData
                ... NavigationData
            }
        }
    `;
    const videoId = decodeURIComponent(matches[1]);
    const queryRef = loadQuery<VideoPageDirectOpencastLinkQuery>(query, { id: videoId });

    return matchedDirectRoute(query, queryRef);
});


interface DirectRouteQuery extends OperationType {
    response: UserData$key & {
        realm: VideoPageRealmData$key & NavigationData$key;
        event: VideoPageEventData$key | null;
    };
}

/** Shared code of both direct routes */
const matchedDirectRoute = (
    query: GraphQLTaggedNode,
    queryRef: PreloadedQuery<DirectRouteQuery>,
): MatchedRoute => ({
    render: () => <RootLoader
        {... { query, queryRef }}
        noindex
        nav={data => data.realm ? <Nav fragRef={data.realm} /> : []}
        render={({ event, realm }) => !event
            ? <NotFound kind="video" />
            : <VideoPage
                eventRef={event}
                realmRef={realm ?? unreachable("root realm doesn't exist")}
                basePath="/!v"
            />}
    />,
    dispose: () => queryRef.dispose(),
});


// ===========================================================================================
// ===== GraphQL Fragments
// ===========================================================================================

const realmFragment = graphql`
    fragment VideoPageRealmData on Realm {
        name
        path
        isMainRoot
        ancestors { name path }
    }
`;

const eventFragment = graphql`
    fragment VideoPageEventData on Event {
        __typename
        ... on NotAllowed { dummy } # workaround
        ... on AuthorizedEvent {
            id
            title
            description
            creators
            created
            isLive
            opencastId
            metadata
            canWrite
            syncedData {
                updated
                duration
                thumbnail
                startTime
                endTime
                tracks { uri flavor mimetype resolution isMaster }
                captions { uri lang }
            }
            series {
                id
                title
                ... SeriesBlockSeriesData
            }
        }
    }
`;


// ===========================================================================================
// ===== Components
// ===========================================================================================

type Props = {
    eventRef: NonNullable<VideoPageEventData$key>;
    realmRef: NonNullable<VideoPageRealmData$key>;
    basePath: string;
};

const VideoPage: React.FC<Props> = ({ eventRef, realmRef, basePath }) => {
    const { t } = useTranslation();
    const rerender = useForceRerender();
    const event = useFragment(eventFragment, eventRef);
    const realm = useFragment(realmFragment, realmRef);

    if (event.__typename === "NotAllowed") {
        return <ErrorPage title={t("api-remote-errors.view.event")} />;
    }
    if (event.__typename !== "AuthorizedEvent") {
        return unreachable();
    }

    if (!isSynced(event)) {
        return <WaitingPage type="video" />;
    }

    const breadcrumbs = realm.isMainRoot ? [] : realmBreadcrumbs(t, realm.ancestors.concat(realm));

    const { hasStarted, hasEnded } = getEventTimeInfo(event);
    const isCurrentlyLive = hasStarted === true && hasEnded === false;

    const structuredData: WithContext<VideoObject> = {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        name: event.title,
        description: event.description ?? undefined,
        thumbnailUrl: event.syncedData.thumbnail ?? undefined,
        uploadDate: event.created,
        duration: toIsoDuration(event.syncedData.duration),
        ...event.isLive && event.syncedData.startTime && event.syncedData.endTime && {
            publication: {
                "@type": "BroadcastEvent",
                isLiveBroadcast: isCurrentlyLive,
                startDate: event.syncedData.startTime,
                endDate: event.syncedData.endTime,
            },
        },
        // TODO: Provide `contentUrl` or `embedUrl`? Google docs say one should,
        // but it's not clear what for.
    };


    return <>
        <Breadcrumbs path={breadcrumbs} tail={event.title} />
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
        <InlinePlayer event={event} css={{ margin: "0 auto" }} onEventStateChange={rerender} />
        <Metadata id={event.id} event={event} />

        <div css={{ height: 80 }} />

        {event.series && <SeriesBlockFromSeries
            basePath={basePath}
            fragRef={event.series}
            title={t("video.more-from-series", { series: event.series.title })}
            activeEventId={event.id}
        />}
    </>;
};


type Event = Extract<NonNullable<VideoPageEventData$data>, { __typename: "AuthorizedEvent" }>;
type SyncedEvent = SyncedOpencastEntity<Event>;

type MetadataProps = {
    id: string;
    event: SyncedEvent;
};

const Metadata: React.FC<MetadataProps> = ({ id, event }) => {
    const { t } = useTranslation();
    const user = useUser();

    return <>
        <div css={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 24,
            gap: 8,
            [`@media (max-width: ${BREAKPOINT_MEDIUM}px)`]: {
                flexDirection: "column",
                alignItems: "flex-start",
            },
        }}>
            <div>
                <VideoTitle title={event.title} />
                <VideoDate event={event} />
            </div>
            <div css={{ display: "flex", gap: 8 }}>
                {event.canWrite && user !== "none" && user !== "unknown" && (
                    <LinkButton to={`/~manage/videos/${id.slice(2)}`}>
                        <FiSettings size={16} />
                        {t("video.manage")}
                    </LinkButton>
                )}
                <ShareButton event={event} />
            </div>
        </div>
        <hr />
        <div css={{
            display: "grid",
            gridTemplate: "1fr / 1fr fit-content(30%)",
            columnGap: 48,
            rowGap: 24,
            [`@media (max-width: ${BREAKPOINT_MEDIUM}px)`]: {
                gridTemplate: "auto auto / 1fr",
            },
        }}>
            <div css={{ maxWidth: 700 }}>
                <Creators creators={event.creators} css={{ fontWeight: "bold" }} />
                <Description
                    text={event.description}
                    css={{ color: "var(--grey20)", fontSize: 14 }}
                />
            </div>
            <div css={{ paddingTop: 8 }}>
                <MetadataTable event={event} />
            </div>
        </div>

    </>;
};

const ShareButton: React.FC<{ event: SyncedEvent }> = ({ event }) => {
    type State = "closed" | "main" | "direct-link" | "embed";

    const { t } = useTranslation();
    const [state, setState] = useState<State>("closed");
    const ref = useRef(null);
    useOnOutsideClick(ref, () => setState("closed"));

    const id = event.id.substring(2);

    // TODO: maybe move out of this
    const Heading: React.FC<React.PropsWithChildren> = ({ children }) => (
        <strong css={{ fontSize: 18, display: "block", marginBottom: 16 }}>
            {children}
        </strong>
    );

    const inner = match(state, {
        "closed": () => null,
        "main": () => <>
            <Heading>{t("video.share.share-video")}</Heading>
            <CopyableInput
                css={{ fontSize: 14, margin: "16px 0", width: 400 }}
                // TODO
                value={window.location.href}
            />
            <div css={{
                display: "flex",
                gap: 8,
                "& > button": {
                    display: "flex",
                    minWidth: 85,
                    padding: "8px 8px 4px 8px",
                    cursor: "pointer",
                    flexDirection: "column",
                    alignItems: "center",
                    borderRadius: 4,
                    "& > svg": {
                        width: 48,
                        height: 48,
                        backgroundColor: "var(--accent-color)",
                        color: "var(--accent-color-bw-contrast)",
                        borderRadius: 24,
                        padding: 12,
                    },
                    "&:hover": {
                        backgroundColor: "var(--grey92)",
                    },
                },
            }}>
                <ProtoButton onClick={() => setState("direct-link")}>
                    <FiCrosshair />
                    <div>{t("video.share.direct-link")}</div>
                </ProtoButton>
                <ProtoButton onClick={() => setState("embed")}>
                    <FiCode />
                    <div>{t("video.share.embed")}</div>
                </ProtoButton>
            </div>
        </>,
        "direct-link": () => {
            const target = new URL(window.location.href);
            target.pathname = `/!v/${id}`;

            return <>
                <Heading>{t("video.share.direct-link")}</Heading>
                <Card kind="info" iconPos="top" css={{ maxWidth: 400, fontSize: 14 }}>
                    {t("video.share.direct-link-info")}
                </Card>
                <CopyableInput
                    css={{ fontSize: 14, marginTop: 16, width: 400 }}
                    value={target.toString()}
                />
            </>;
        },
        "embed": () => {
            const ar = event.syncedData == null
                ? [16, 9]
                : getPlayerAspectRatio(event.syncedData.tracks);

            const target = new URL(location.href);
            target.pathname = `/~embed/!v/${event.id.slice(2)}`;

            const embedCode = `<iframe ${[
                'name="Tobira Player"',
                `src="${target}"`,
                "allow=fullscreen",
                `style="${[
                    "border: none;",
                    "width: 100%;",
                    `aspect-ratio: ${ar.join("/")};`,
                ].join(" ")}"`,
            ].join(" ")}></iframe>`;

            return <>
                <Heading>{t("video.share.embed")}</Heading>
                <CopyableInput
                    value={embedCode}
                    multiline
                    css={{ fontSize: 14, width: 400 }}
                />
            </>;
        },
    });


    return (
        <FloatingContainer
            ref={ref}
            placement="top"
            arrowSize={12}
            ariaRole="dialog"
            open={state !== "closed"}
        >
            <FloatingTrigger>
                <Button onClick={() => setState(state => state === "closed" ? "main" : "closed")}>
                    <FiShare2 size={16} />
                    {t("general.share")}
                </Button>
            </FloatingTrigger>
            <Floating padding={[8, 16, 16, 16]}>{inner}</Floating>
        </FloatingContainer>
    );
};



type VideoTitleProps = {
    title: string;
};

const VideoTitle: React.FC<VideoTitleProps> = ({ title }) => (
    <PageTitle title={title} css={{
        marginBottom: 4,
        fontSize: 22,
        [`@media (max-width: ${BREAKPOINT_MEDIUM}px)`]: { fontSize: 20 },
        [`@media (max-width: ${BREAKPOINT_SMALL}px)`]: { fontSize: 18 },
        lineHeight: 1.2,
        ...ellipsisOverflowCss(2),
    }} />
);


type VideoDateProps = {
    event: SyncedEvent;
};

const VideoDate: React.FC<VideoDateProps> = ({ event }) => {
    const { t, i18n } = useTranslation();

    const { created, updated, startTime, endTime, hasStarted, hasEnded } = getEventTimeInfo(event);

    const fullOptions = { dateStyle: "long", timeStyle: "short" } as const;
    let inner;
    if (event.isLive && hasEnded) {
        inner = <>
            {t("video.ended") + ": "}
            {endTime.toLocaleString(i18n.language, fullOptions)}
        </>;
    } else if (event.isLive && hasStarted === false) {
        inner = <>
            {t("video.upcoming") + ": "}
            {startTime.toLocaleString(i18n.language, fullOptions)}
        </>;
    } else {
        const createdDate = created.toLocaleDateString(i18n.language, { dateStyle: "long" });
        const createdFull = created.toLocaleString(i18n.language, fullOptions);
        const updatedFull = updated.getTime() - created.getTime() > 5 * 60 * 1000
            ? updated.toLocaleString(i18n.language, fullOptions)
            : null;

        const tooltip = <>
            <i>{t("video.created")}</i>: {createdFull}
            {updatedFull && <>
                <br/>
                <i>{t("video.updated")}</i>: {updatedFull}
            </>}
        </>;
        inner = <WithTooltip distance={0} tooltip={tooltip}>
            <div>{createdDate}</div>
        </WithTooltip>;
    }

    return (
        <div css={{
            display: "inline-block",
            position: "relative",
            color: "var(--grey40)",
            fontSize: 14,
        }}>{inner}</div>
    );
};

type MetadataTableProps = {
    event: Event;
};

const MetadataTable: React.FC<MetadataTableProps> = ({ event }) => {
    const { t, i18n } = useTranslation();

    const pairs: [string, ReactNode][] = [];

    if (event.series !== null) {
        pairs.push([
            t("video.part-of-series"),
            // eslint-disable-next-line react/jsx-key
            <Link to={`/!s/${event.series.id.slice(2)}`}>{event.series.title}</Link>,
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

                const values = metadataNs[field].map((value, i) => <React.Fragment key={i}>
                    {i > 0 && <br />}
                    {isValidLink(value) ? <Link to={value}>{value}</Link> : value}
                </React.Fragment>);

                pairs.push([translatedLabel, values]);
            }
        }
    }

    return (
        <dl css={{
            display: "grid",
            columnGap: 16,
            rowGap: 6,
            fontSize: 14,
            lineHeight: 1.3,
            gridTemplateColumns: "max-content 1fr",
            "& > dt::after": {
                content: "':'",
            },
            "& > dd": {
                color: "var(--grey40)",
            },
        }}>
            {pairs.map(([label, value], i) => <React.Fragment key={i}>
                <dt>{label}</dt>
                <dd>{value}</dd>
            </React.Fragment>)}
        </dl>
    );
};

const isValidLink = (s: string): boolean => {
    const trimmed = s.trim();
    if (!(trimmed.startsWith("http://") || trimmed.startsWith("https://"))) {
        return false;
    }

    try {
        new URL(trimmed);
    } catch (_) {
        return false;
    }

    return true;
};
