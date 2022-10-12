import React, { ReactNode, useRef } from "react";
import { graphql, GraphQLTaggedNode, PreloadedQuery, useFragment } from "react-relay/hooks";
import { useTranslation } from "react-i18next";
import { OperationType } from "relay-runtime";

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
import { currentRef, SyncedOpencastEntity, isSynced, toIsoDuration } from "../util";
import { unreachable } from "../util/err";
import { BREAKPOINT_SMALL, BREAKPOINT_MEDIUM } from "../GlobalStyle";
import { Button, LinkButton } from "../ui/Button";
import CONFIG from "../config";
import { translatedConfig, match } from "../util";
import { Link } from "../router";
import { useUser } from "../User";
import { b64regex } from "./util";
import { ErrorPage } from "../ui/error";
import { Modal, ModalHandle } from "../ui/Modal";
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
import { Description, getEventTimeInfo } from "../util/video";
import { Creators } from "../ui/Video";


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
        isRoot
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
                tracks { uri flavor mimetype resolution }
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

    const breadcrumbs = (realm.isRoot ? realm.ancestors : realm.ancestors.concat(realm))
        .map(({ name, path }) => ({ label: name, link: path }));

    const { hasStarted, hasEnded } = getEventTimeInfo(event);
    const isCurrentlyLive = hasStarted === true && hasEnded === false;

    const structuredData = {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        name: event.title,
        description: event.description,
        thumbnailUrl: event.syncedData.thumbnail,
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
        <InlinePlayer event={event} css={{ margin: "0 auto" }} />
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
        <div css={{ display: "flex", alignItems: "center", marginTop: 24, gap: 8 }}>
            <div css={{ flex: "1" }}>
                <VideoTitle title={event.title} />
                <VideoDate event={event} />
            </div>
            {event.canWrite && user !== "none" && user !== "unknown" && (
                <LinkButton to={`/~manage/videos/${id.slice(2)}`}>
                    {t("manage.my-videos.manage-video")}
                </LinkButton>
            )}
            <EmbedCode event={event} />
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

        // Truncate title after two lines
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        textOverflow: "ellipsis",
        WebkitLineClamp: 2,
        overflow: "hidden",
    }} />
);

type EmbedCodeProps = {
    event: SyncedEvent;
};

const EmbedCode: React.FC<EmbedCodeProps> = ({ event: {
    id,
    syncedData: { tracks },
} }) => {
    const { t } = useTranslation();
    const modal = useRef<ModalHandle>(null);

    const target = new URL(location.href);
    target.pathname = `/~embed/!v/${id.slice(2)}`;

    const embedCode = `<iframe ${[
        `src="${target}"`,
        "allow=fullscreen",
        `style="${[
            "border: none;",
            "width: 100%;",
            `aspect-ratio: ${getPlayerAspectRatio(tracks).join("/")};`,
        ].join(" ")}"`,
        'name="Tobira Player"',
    ].join(" ")}></iframe>`;

    return <>
        <Button onClick={() => currentRef(modal).open()}>{t("video.embed.button")}</Button>
        <Modal title={t("video.embed.title")} ref={modal}>
            <CopyableInput value={embedCode} />
        </Modal>
    </>;
};


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

        inner = <>
            {createdDate}
            <div css={{
                display: "none",
                position: "absolute",
                left: 2,
                bottom: "calc(100% + 10px)",
                width: "max-content",
                padding: "5px 10px",
                backgroundColor: "var(--grey86)",
                borderRadius: 5,
                color: "black",
                zIndex: 100,
            }}>
                <div css={{
                    position: "absolute",
                    width: 12,
                    height: 12,
                    bottom: -5,
                    left: 20,
                    backgroundColor: "inherit",
                    transform: "rotate(45deg)",
                }} />
                <i>{t("video.created")}</i>: {createdFull}
                {updatedFull && <>
                    <br/>
                    <i>{t("video.updated")}</i>: {updatedFull}
                </>}
            </div>
        </>;
    }

    return (
        <div css={{
            display: "inline-block",
            position: "relative",
            color: "var(--grey40)",
            fontSize: 14,
            "&:hover > div": {
                display: "initial",
            },
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
