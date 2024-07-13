import React, { ReactElement, ReactNode, useEffect, useRef, useState } from "react";
import { graphql, GraphQLTaggedNode, PreloadedQuery, useFragment } from "react-relay/hooks";
import { useTranslation } from "react-i18next";
import { OperationType } from "relay-runtime";
import { LuCode, LuDownload, LuLink, LuQrCode, LuRss, LuSettings, LuShare2 } from "react-icons/lu";
import { QRCodeCanvas } from "qrcode.react";
import {
    match, unreachable, ProtoButton,
    useColorScheme, Floating, FloatingContainer, FloatingTrigger, WithTooltip, screenWidthAtMost,
    Card, Button,
} from "@opencast/appkit";
import { VideoObject, WithContext } from "schema-dts";

import { loadQuery } from "../relay";
import { InitialLoading, RootLoader } from "../layout/Root";
import { NotFound } from "./NotFound";
import { Nav } from "../layout/Navigation";
import { WaitingPage } from "../ui/Waiting";
import { getPlayerAspectRatio, InlinePlayer } from "../ui/player";
import { SeriesBlockFromSeries } from "../ui/Blocks/Series";
import { makeRoute, MatchedRoute } from "../rauta";
import { isValidRealmPath } from "./Realm";
import { Breadcrumbs } from "../ui/Breadcrumbs";
import { PageTitle } from "../layout/header/ui";
import {
    SyncedOpencastEntity,
    isSynced,
    toIsoDuration,
    useForceRerender,
    translatedConfig,
    currentRef,
    secondsToTimeString,
    eventId,
    keyOfId,
    playlistId,
} from "../util";
import { BREAKPOINT_SMALL, BREAKPOINT_MEDIUM } from "../GlobalStyle";
import { LinkButton } from "../ui/LinkButton";
import CONFIG from "../config";
import { Link, useRouter } from "../router";
import { useUser } from "../User";
import { b64regex } from "./util";
import { ErrorPage } from "../ui/error";
import { CopyableInput, InputWithCheckbox, TimeInput } from "../ui/Input";
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
import { VideoPageByOcIdInRealmQuery } from "./__generated__/VideoPageByOcIdInRealmQuery.graphql";
import {
    PlaylistBlockPlaylistData$key,
} from "../ui/Blocks/__generated__/PlaylistBlockPlaylistData.graphql";
import { getEventTimeInfo } from "../util/video";
import { formatDuration } from "../ui/Video";
import { ellipsisOverflowCss, focusStyle } from "../ui";
import { realmBreadcrumbs } from "../util/realm";
import { TrackInfo } from "./manage/Video/TechnicalDetails";
import { COLORS } from "../color";
import { RelativeDate } from "../ui/time";
import { Modal, ModalHandle } from "../ui/Modal";
import { PlayerContextProvider, usePlayerContext } from "../ui/player/PlayerContext";
import { CollapsibleDescription } from "../ui/metadata";
import { DirectSeriesRoute } from "./Series";
import { EmbedVideoRoute } from "./Embed";
import { ManageVideoDetailsRoute } from "./manage/Video/Details";
import { PlaylistBlockFromPlaylist } from "../ui/Blocks/Playlist";


// ===========================================================================================
// ===== Route definitions
// ===========================================================================================

/** Video in realm route: `/path/to/realm/v/<videoid>` */
export const VideoRoute = makeRoute({
    url: ({ realmPath, videoID }: { realmPath: string; videoID: string }) =>
        `${realmPath === "/" ? "" : realmPath}/v/${keyOfId(videoID)}`,
    match: url => {
        const params = getVideoDetailsFromUrl(url, b64regex);
        if (params === null) {
            return null;
        }
        const { realmPath, videoId, listId } = params;

        const query = graphql`
            query VideoPageInRealmQuery($id: ID!, $realmPath: String!, $listId: ID!) {
                ... UserData
                event: eventById(id: $id) {
                    ... VideoPageEventData
                    ... on AuthorizedEvent {
                        isReferencedByRealm(path: $realmPath)
                    }
                }
                realm: realmByPath(path: $realmPath) {
                    ... VideoPageRealmData
                    ... NavigationData
                }
                playlist: playlistById(id: $listId) { ...PlaylistBlockPlaylistData }
            }
        `;

        const queryRef = loadQuery<VideoPageInRealmQuery>(query, {
            id: eventId(videoId),
            realmPath,
            listId,
        });

        return {
            render: () => <RootLoader
                {... { query, queryRef }}
                nav={data => data.realm ? <Nav fragRef={data.realm} /> : []}
                render={({ event, realm, playlist }) => {
                    if (!event) {
                        return <NotFound kind="video" />;
                    }

                    if (!realm || !event.isReferencedByRealm) {
                        return <ForwardToDirectRoute videoId={videoId} />;
                    }

                    return <VideoPage
                        eventRef={event}
                        realmRef={realm}
                        playlistRef={playlist ?? null}
                        basePath={realmPath.replace(/\/$/u, "") + "/v"}
                    />;
                }}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

/** Video in realm route: `/path/to/realm/v/:<ocid>` */
export const OpencastVideoRoute = makeRoute({
    url: ({ realmPath, ocId }: { realmPath: string; ocId: string }) =>
        `${realmPath === "/" ? "" : realmPath}/v/:${ocId}`,
    match: url => {
        const params = getVideoDetailsFromUrl(url, ":([^/]+)");
        if (params === null) {
            return null;
        }

        const { realmPath, videoId, listId } = params;
        const id = videoId.substring(1);

        const query = graphql`
            query VideoPageByOcIdInRealmQuery($id: String!, $realmPath: String!, $listId: ID!) {
                ... UserData
                event: eventByOpencastId(id: $id) {
                    ... VideoPageEventData
                    ... on AuthorizedEvent {
                        isReferencedByRealm(path: $realmPath)
                    }
                }
                realm: realmByPath(path: $realmPath) {
                    ... VideoPageRealmData
                    ... NavigationData
                }
                playlist: playlistById(id: $listId) { ...PlaylistBlockPlaylistData }
            }
        `;

        const queryRef = loadQuery<VideoPageByOcIdInRealmQuery>(query, {
            id,
            realmPath,
            listId,
        });

        return {
            render: () => <RootLoader
                {... { query, queryRef }}
                nav={data => data.realm ? <Nav fragRef={data.realm} /> : []}
                render={({ event, realm, playlist }) => {
                    if (!event) {
                        return <NotFound kind="video" />;
                    }

                    if (!realm || !event.isReferencedByRealm) {
                        return <ForwardToDirectOcRoute ocID={id} />;
                    }

                    return <VideoPage
                        eventRef={event}
                        realmRef={realm}
                        playlistRef={playlist ?? null}
                        basePath={realmPath.replace(/\/$/u, "") + "/v"}
                    />;
                }}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

type VideoParams = {
    realmPath: string;
    videoId: string;
    listId: string;
} | null;

const getVideoDetailsFromUrl = (url: URL, regEx: string): VideoParams => {
    const urlPath = url.pathname.replace(/^\/|\/$/g, "");
    const listId = makeListId(url.searchParams.get("list"));
    const parts = urlPath.split("/").map(decodeURIComponent);
    if (parts.length < 2) {
        return null;
    }
    if (parts[parts.length - 2] !== "v") {
        return null;
    }
    const videoId = parts[parts.length - 1];
    if (!videoId.match(regEx)) {
        return null;
    }

    const realmPathParts = parts.slice(0, parts.length - 2);
    if (!isValidRealmPath(realmPathParts)) {
        return null;
    }

    const realmPath = "/" + realmPathParts.join("/");

    return { realmPath, videoId, listId };
};

const makeListId = (id: string | null) => id ? playlistId(id) : "";

const ForwardToDirectRoute: React.FC<{ videoId: string }> = ({ videoId }) => {
    const router = useRouter();
    useEffect(() => router.goto(DirectVideoRoute.url({ videoId }), true));
    return <InitialLoading />;
};

const ForwardToDirectOcRoute: React.FC<{ ocID: string }> = ({ ocID }) => {
    const router = useRouter();
    useEffect(() => router.goto(DirectOpencastVideoRoute.url({ ocID }), true));
    return <InitialLoading />;
};

/** Direct link to video with our ID: `/!v/<videoid>` */
export const DirectVideoRoute = makeRoute({
    url: (args: { videoId: string }) => `/!v/${keyOfId(args.videoId)}`,
    match: url => {
        const regex = new RegExp(`^/!v/(${b64regex}+)/?$`, "u");
        const params = regex.exec(url.pathname);
        if (params === null) {
            return null;
        }

        const query = graphql`
            query VideoPageDirectLinkQuery($id: ID!, $listId: ID!) {
                ... UserData
                event: eventById(id: $id) { ... VideoPageEventData }
                realm: rootRealm {
                    ... VideoPageRealmData
                    ... NavigationData
                }
                playlist: playlistById(id: $listId) { ...PlaylistBlockPlaylistData }
            }
        `;
        const videoId = decodeURIComponent(params[1]);
        const queryRef = loadQuery<VideoPageDirectLinkQuery>(query, {
            id: eventId(videoId),
            listId: makeListId(url.searchParams.get("list")),
        });

        return matchedDirectRoute(query, queryRef);
    },
});

/** Direct link to video with Opencast ID: `/!v/:<ocid>` */
export const DirectOpencastVideoRoute = makeRoute({
    url: (args: { ocID: string }) => `/!v/:${args.ocID}`,
    match: url => {
        const regex = new RegExp("^/!v/:([^/]+)$", "u");
        const matches = regex.exec(url.pathname);
        if (!matches) {
            return null;
        }

        const query = graphql`
            query VideoPageDirectOpencastLinkQuery($id: String!, $listId: ID!) {
                ... UserData
                event: eventByOpencastId(id: $id) { ... VideoPageEventData }
                realm: rootRealm {
                    ... VideoPageRealmData
                    ... NavigationData
                }
                playlist: playlistById(id: $listId) { ...PlaylistBlockPlaylistData }
            }
        `;
        const videoId = decodeURIComponent(matches[1]);
        const queryRef = loadQuery<VideoPageDirectOpencastLinkQuery>(query, {
            id: videoId,
            listId: makeListId(url.searchParams.get("list")),
        });

        return matchedDirectRoute(query, queryRef);
    },
});


interface DirectRouteQuery extends OperationType {
    response: UserData$key & {
        realm: VideoPageRealmData$key & NavigationData$key;
        event?: VideoPageEventData$key | null;
        playlist?: PlaylistBlockPlaylistData$key | null;
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
        render={({ event, realm, playlist }) => !event
            ? <NotFound kind="video" />
            : <VideoPage
                eventRef={event}
                realmRef={realm ?? unreachable("root realm doesn't exist")}
                playlistRef={playlist ?? null}
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
                segments { uri startTime }
            }
            series {
                id
                opencastId
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
    playlistRef: PlaylistBlockPlaylistData$key | null;
    basePath: string;
};

const VideoPage: React.FC<Props> = ({ eventRef, realmRef, playlistRef, basePath }) => {
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
        <PlayerContextProvider>
            <InlinePlayer
                event={event}
                css={{ margin: "-4px auto 0" }}
                onEventStateChange={rerender}
            />
            <Metadata id={event.id} event={event} />
        </PlayerContextProvider>

        <div css={{ height: 80 }} />

        {playlistRef
            ? <PlaylistBlockFromPlaylist
                moreOfTitle
                basePath={basePath}
                fragRef={playlistRef}
                activeEventId={event.id}
            />
            : event.series && <SeriesBlockFromSeries
                basePath={basePath}
                fragRef={event.series}
                title={t("video.more-from-series", { series: event.series.title })}
                activeEventId={event.id}
            />
        }
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

    const shrinkOnMobile = {
        [screenWidthAtMost(BREAKPOINT_SMALL)]: {
            padding: "5px 10px",
            gap: 10,
        },
    };

    return <>
        <div css={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "space-between",
            margin: "16px 0",
            gap: 8,
        }}>
            <div>
                <VideoTitle title={event.title} />
                <VideoDate {...{ event }} />
            </div>
            {/* Buttons */}
            <div css={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                "> button": { ...shrinkOnMobile },
            }}>
                {event.canWrite && user !== "none" && user !== "unknown" && (
                    <LinkButton to={ManageVideoDetailsRoute.url({ videoId: id })} css={{
                        "&:not([disabled])": { color: COLORS.primary0 },
                        ...shrinkOnMobile,
                    }}>
                        <LuSettings size={16} />
                        {t("video.manage")}
                    </LinkButton>
                )}
                {CONFIG.showDownloadButton && <DownloadButton event={event} />}
                <ShareButton {...{ event }} />
            </div>
        </div>
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
            <CollapsibleDescription
                type="video"
                description={event.description}
                creators={event.creators}
                bottomPadding={40}
            />
            <div css={{ flex: "1 200px", alignSelf: "flex-start", padding: "20px 22px" }}>
                <MetadataTable {...{ event }} />
            </div>
        </div>
    </>;
};


const PopoverHeading: React.FC<React.PropsWithChildren> = ({ children }) => (
    <strong css={{ fontSize: 18, display: "block", marginBottom: 16 }}>
        {children}
    </strong>
);

const DownloadButton: React.FC<{ event: SyncedEvent }> = ({ event }) => {
    const { t } = useTranslation();
    const ref = useRef(null);
    const isDark = useColorScheme().scheme === "dark";

    return (
        <FloatingContainer
            ref={ref}
            placement="top"
            arrowSize={12}
            ariaRole="dialog"
            trigger="click"
            viewPortMargin={12}
        >
            {!event.isLive && <FloatingTrigger>
                <Button>
                    <LuDownload size={16}/>
                    {t("video.download.title")}
                </Button>
            </FloatingTrigger>}
            <Floating
                backgroundColor={isDark ? COLORS.neutral15 : COLORS.neutral05}
                padding={[8, 16, 16, 16]}
            >
                <PopoverHeading>{t("video.download.title")}</PopoverHeading>
                <Card kind="info" iconPos="left" css={{ maxWidth: 400, fontSize: 14 }}>
                    {t("video.download.info")}
                </Card>
                <TrackInfo event={event} translateFlavors css={{ h2: { display: "none" } }} />
            </Floating>
        </FloatingContainer>
    );
};

const ShareButton: React.FC<{ event: SyncedEvent }> = ({ event }) => {
    type MenuState = "closed" | "main" | "embed" | "rss";
    /* eslint-disable react/jsx-key */
    const entries: [Exclude<MenuState, "closed">, ReactElement][] = [
        ["main", <LuLink />],
        ["embed", <LuCode />],
    ];
    if (event.series) {
        entries.push(["rss", <LuRss />]);
    }
    /* eslint-enable react/jsx-key */

    const { t } = useTranslation();
    const [menuState, setMenuState] = useState<MenuState>("closed");
    const [timestamp, setTimestamp] = useState(0);
    const [addLinkTimestamp, setAddLinkTimestamp] = useState(false);
    const [addEmbedTimestamp, setAddEmbedTimestamp] = useState(false);
    const isDark = useColorScheme().scheme === "dark";
    const ref = useRef(null);
    const qrModalRef = useRef<ModalHandle>(null);
    const { paella, playerIsLoaded } = usePlayerContext();

    const timeStringPattern = /\?t=(\d+h)?(\d+m)?(\d+s)?/;

    const isActive = (label: MenuState) => label === menuState;

    const tabStyle = {
        display: "flex",
        flexDirection: "column",
        flex: `1 calc(100% / ${entries.length})`,
        backgroundColor: COLORS.neutral20,
        paddingBottom: 4,
        cursor: "pointer",
        alignItems: "center",
        borderRight: `1px solid ${COLORS.neutral40}`,
        borderTop: "none",
        borderBottom: `1px solid ${COLORS.neutral40}`,
        ":is(:first-child)": { borderTopLeftRadius: 4 },
        ":is(:last-child)": {
            borderRight: "none",
            borderTopRightRadius: 4,
        },
        "& > svg": {
            width: 32,
            height: 32,
            color: COLORS.primary1,
            padding: "8px 4px 4px",
        },
        "&[disabled]": {
            cursor: "default",
            backgroundColor: isDark ? COLORS.neutral15 : COLORS.neutral05,
            borderBottom: "none",
            svg: { color: COLORS.primary0 },
        },
        ":not([disabled])": {
            "&:hover": { backgroundColor: COLORS.neutral15 },
        },
        ...focusStyle({ inset: true }),

        // By using the `has()` selector, these styles only get applied
        // to non-firefox browsers. Once firefox supports that selector,
        // this border radius stuff should get refactored.
        ":has(svg)": {
            "&[disabled]": {
                borderRight: "none",
                "+ button": {
                    borderLeft: `1px solid ${COLORS.neutral40}`,
                    borderBottomLeftRadius: 4,
                },
            },
            ":not([disabled]):has(+ button[disabled])": {
                borderBottomRightRadius: 4,
                borderLeft: "none",
            },
        },
    } as const;

    const header = <div css={{ display: "flex" }}>
        {entries.map(([label, icon]) => (
            <ProtoButton
                disabled={isActive(label)}
                key={label}
                onClick={() => setMenuState(label)}
                css={tabStyle}
            >
                {icon}
                {t(`video.share.${label}`)}
            </ProtoButton>
        ))}
    </div>;

    const ShowQRCodeButton: React.FC<{ target: string; label: MenuState }> = (
        { target, label }
    ) => <>
        <Button
            onClick={() => currentRef(qrModalRef).open()}
            css={{ width: "max-content" }}
        >
            <LuQrCode />
            {t("video.share.show-qr-code")}
        </Button>
        <Modal
            ref={qrModalRef}
            title={t("video.share.title", { title: label })}
            css={{ minWidth: "max-content" }}
            closeOnOutsideClick
        >
            <div css={{ display: "flex", justifyContent: "center" }}>
                <QRCodeCanvas
                    value={target}
                    size={250}
                    css={{
                        margin: 16,
                        outline: "8px solid #FFFFFF",
                    }}
                />
            </div>
        </Modal>
    </>;

    const inner = match(menuState, {
        "closed": () => null,
        "main": () => {
            let url = window.location.href.replace(timeStringPattern, "");
            url += addLinkTimestamp && timestamp
                ? `?t=${secondsToTimeString(timestamp)}`
                : "";

            return <>
                <div>
                    <CopyableInput
                        label={t("manage.my-videos.details.copy-direct-link-to-clipboard")}
                        css={{ fontSize: 14, width: 400, marginBottom: 6 }}
                        value={url}
                    />
                    {!event.isLive && <InputWithCheckbox
                        checkboxChecked={addLinkTimestamp}
                        setCheckboxChecked={setAddLinkTimestamp}
                        label={t("manage.my-videos.details.set-time")}
                        input={<TimeInput
                            {...{ timestamp, setTimestamp }}
                            disabled={!addLinkTimestamp}
                        />}
                    />}
                </div>
                <ShowQRCodeButton target={url} label={menuState} />
            </>;
        },
        "embed": () => {
            const ar = event.syncedData == null
                ? [16, 9]
                : getPlayerAspectRatio(event.syncedData.tracks);

            const url = new URL(location.href.replace(timeStringPattern, ""));
            url.search = addEmbedTimestamp && timestamp
                ? `?t=${secondsToTimeString(timestamp)}`
                : "";
            url.pathname = EmbedVideoRoute.url({ videoId: event.id });

            const embedCode = `<iframe ${[
                'name="Tobira Player"',
                `src="${url}"`,
                "allow=fullscreen",
                `style="${[
                    "border: none;",
                    "width: 100%;",
                    `aspect-ratio: ${ar.join("/")};`,
                ].join(" ")}"`,
            ].join(" ")}></iframe>`;

            return <>
                <div>
                    <CopyableInput
                        label={t("video.embed.copy-embed-code-to-clipboard")}
                        value={embedCode}
                        multiline
                        css={{ fontSize: 14, width: 400, height: 75, marginBottom: 6 }}
                    />
                    {!event.isLive && <InputWithCheckbox
                        checkboxChecked={addEmbedTimestamp}
                        setCheckboxChecked={setAddEmbedTimestamp}
                        label={t("manage.my-videos.details.set-time")}
                        input={<TimeInput
                            {...{ timestamp, setTimestamp }}
                            disabled={!addEmbedTimestamp}
                        />}
                    />}
                </div>
                <ShowQRCodeButton target={embedCode} label={menuState} />
            </>;
        },
        "rss": () => {
            if (event.series) {
                const rssUrl = window.location.origin + `/~rss/series/${keyOfId(event.series.id)}`;
                return <>
                    <div>
                        <CopyableInput
                            label={t("video.rss.copy-link-to-clipboard")}
                            css={{ fontSize: 14, width: 400, marginBottom: 6 }}
                            value={rssUrl}
                        />
                    </div>
                    <ShowQRCodeButton target={rssUrl} label={menuState} />
                </>;
            } else {
                return null;
            }
        },
    });


    return (
        <FloatingContainer
            ref={ref}
            placement="top"
            arrowSize={12}
            ariaRole="dialog"
            open={menuState !== "closed"}
            onClose={() => setMenuState("closed")}
            viewPortMargin={12}
        >
            <FloatingTrigger>
                <Button onClick={() => {
                    setMenuState(state => state === "closed" ? "main" : "closed");
                    if (playerIsLoaded) {
                        paella.current?.player.videoContainer.currentTime().then(res => {
                            setTimestamp(res);
                        });
                    }
                }}>
                    <LuShare2 size={16} />
                    {t("general.action.share")}
                </Button>
            </FloatingTrigger>
            <Floating
                padding={0}
                backgroundColor={isDark ? COLORS.neutral15 : COLORS.neutral05}
                css={{
                    height: 240,
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                {header}
                <div css={{
                    margin: 16,
                    flexGrow: 1,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                }}>{inner}</div>
            </Floating>
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
        maxWidth: "80ch",
        [screenWidthAtMost(BREAKPOINT_MEDIUM)]: { fontSize: 20 },
        [screenWidthAtMost(BREAKPOINT_SMALL)]: { fontSize: 18 },
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
    const createdFull = created.toLocaleString(i18n.language, fullOptions);
    const startFull = startTime?.toLocaleString(i18n.language, fullOptions);
    const endFull = endTime?.toLocaleString(i18n.language, fullOptions);
    const updatedFull = updated.getTime() - created.getTime() > 5 * 60 * 1000
        ? updated.toLocaleString(i18n.language, fullOptions)
        : null;

    let inner;
    let tooltip;
    if (event.isLive && hasEnded) {
        inner = <>
            {t("video.ended") + ": "}
            {endFull}
        </>;
    } else if (event.isLive) {
        tooltip = <>
            <i>{hasStarted
                ? t("video.started")
                : t("video.starts")
            }
            </i>: {startFull}
            {endTime && <>
                <br />
                <i>{t("video.ends")}</i>: {endFull}
            </>
            }
            {updatedFull && <>
                <br/>
                <i>{t("video.updated")}</i>: {updatedFull}
            </>}
        </>;

        inner = hasStarted
            ? <div>
                <RelativeDate date={startTime} isLive noTooltip />
            </div>
            : <div>
                {t("video.upcoming") + ": "}
                {startFull}
            </div>;
    } else {
        const createdDate = created.toLocaleDateString(i18n.language, { dateStyle: "long" });
        const startedDate = startTime
            ? startTime !== endTime
                && startTime?.toLocaleDateString(i18n.language, { dateStyle: "long" })
            : null;

        tooltip = <>
            {startedDate
                ? <><i>{t("video.started")}</i>: {startFull}</>
                : <><i>{t("video.created")}</i>: {createdFull}</>
            }
            {updatedFull && <>
                <br/>
                <i>{t("video.updated")}</i>: {updatedFull}
            </>}
        </>;

        inner = <div>{startedDate ?? createdDate}</div>;
    }

    return (
        <div css={{
            display: "inline-block",
            position: "relative",
            color: COLORS.neutral60,
            fontSize: 14,
        }}>
            <WithTooltip distance={0} tooltip={tooltip}>
                {inner}
            </WithTooltip>
        </div>
    );
};

type MetadataTableProps = {
    event: Event;
};

const MetadataTable = React.forwardRef<HTMLDListElement, MetadataTableProps>(({ event }, ref) => {
    const { t, i18n } = useTranslation();
    const pairs: [string, ReactNode][] = [];

    if (event.series) {
        pairs.push([
            t("video.part-of-series"),
            // eslint-disable-next-line react/jsx-key
            <Link to={DirectSeriesRoute.url({ seriesId: event.series.id })}>
                {event.series.title}
            </Link>,
        ]);
    }

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

                const values = metadataNs[field].map((value, i) => <React.Fragment key={i}>
                    {i > 0 && <br />}
                    {isValidLink(value) ? <Link to={value}>{value}</Link> : value}
                </React.Fragment>);

                pairs.push([translatedLabel, values]);
            }
        }
    }

    if (event.syncedData?.duration && !event.isLive) {
        pairs.push([
            t("video.duration"),
            formatDuration(event.syncedData.duration),
        ]);
    }

    return (
        <dl ref={ref} css={{
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
        }}>
            {pairs.map(([label, value], i) => <React.Fragment key={i}>
                <dt>{label}</dt>
                <dd>{value}</dd>
            </React.Fragment>)}
        </dl>
    );
});

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
