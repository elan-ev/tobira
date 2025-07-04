import React, {
    ReactNode,
    useEffect,
    useRef,
    useState,
} from "react";
import {
    graphql, GraphQLTaggedNode, PreloadedQuery, RefetchFnDynamic, useFragment,
    useRefetchableFragment,
} from "react-relay/hooks";
import { useTranslation } from "react-i18next";
import { fetchQuery, OperationType } from "relay-runtime";
import {
    LuCode, LuDownload, LuInfo, LuLink, LuRss, LuSettings, LuLockOpen,
} from "react-icons/lu";
import {
    match, unreachable, screenWidthAtMost, screenWidthAbove, useColorScheme,
    Floating, FloatingContainer, FloatingTrigger, WithTooltip, Card, Button,
    notNullish,
} from "@opencast/appkit";
import { VideoObject, WithContext } from "schema-dts";

import { environment, loadQuery } from "../relay";
import { InitialLoading, RootLoader } from "../layout/Root";
import { NotFound } from "./NotFound";
import { RealmNav } from "../layout/Navigation";
import { WaitingPage } from "../ui/Waiting";
import { getPlayerAspectRatio, InlinePlayer, PlayerPlaceholder } from "../ui/player";
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
    secondsToTimeString,
    eventId,
    keyOfId,
    playlistId,
    getCredentials,
    credentialsStorageKey,
    Credentials,
} from "../util";
import { BREAKPOINT_SMALL, BREAKPOINT_MEDIUM } from "../GlobalStyle";
import { LinkButton } from "../ui/LinkButton";
import CONFIG from "../config";
import { Link, useRouter } from "../router";
import { isRealUser, useUser } from "../User";
import { b64regex } from "./util";
import { ErrorPage } from "../ui/error";
import { CopyableInput, TimeInputWithCheckbox } from "../ui/Input";
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
import { ellipsisOverflowCss } from "../ui";
import { realmBreadcrumbs } from "../util/realm";
import { TrackInfo } from "./manage/Video/TechnicalDetails";
import { COLORS } from "../color";
import { preciseDateTime, preferredLocaleForLang, PrettyDate } from "../ui/time";
import { PlayerContextProvider, usePlayerContext } from "../ui/player/PlayerContext";
import { CollapsibleDescription } from "../ui/metadata";
import { DirectSeriesRoute, SeriesRoute } from "./Series";
import { EmbedVideoRoute } from "./Embed";
import { ManageVideoDetailsRoute } from "./manage/Video/VideoDetails";
import { PlaylistBlockFromPlaylist } from "../ui/Blocks/Playlist";
import { AuthenticationFormState, FormData, AuthenticationForm } from "./Login";
import {
    VideoAuthorizedDataQuery,
} from "./__generated__/VideoAuthorizedDataQuery.graphql";
import { AuthorizedBlockEvent } from "../ui/Blocks/Video";
import {
    VideoPageAuthorizedData$data, VideoPageAuthorizedData$key,
} from "./__generated__/VideoPageAuthorizedData.graphql";
import { QrCodeButton, ShareButton } from "../ui/ShareButton";


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
        const id = eventId(videoId);

        const query = graphql`
            query VideoPageInRealmQuery(
                $id: ID!,
                $realmPath: String!,
                $listId: ID!,
                $eventUser: String,
                $eventPassword: String,
            ) {
                ... UserData
                event: eventById(id: $id) {
                    ... VideoPageEventData
                        @arguments(eventUser: $eventUser, eventPassword: $eventPassword)
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

        const creds = getCredentials("event", id);
        const queryRef = loadQuery<VideoPageInRealmQuery>(query, {
            id,
            realmPath,
            listId,
            eventUser: creds?.user,
            eventPassword: creds?.password,
        });

        return {
            render: () => <RootLoader
                {... { query, queryRef }}
                nav={data => data.realm ? <RealmNav fragRef={data.realm} /> : []}
                render={({ event, realm, playlist }) => {
                    if (!realm || (event && !event.isReferencedByRealm)) {
                        return <ForwardToDirectRoute videoId={videoId} />;
                    }

                    return <VideoPage
                        eventRef={event}
                        realmRef={realm}
                        playlistRef={playlist ?? null}
                        realmPath={realmPath}
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
            query VideoPageByOcIdInRealmQuery(
                $id: String!,
                $realmPath: String!,
                $listId: ID!,
                $eventUser: String,
                $eventPassword: String,
            ) {
                ... UserData
                event: eventByOpencastId(id: $id) {
                    ... VideoPageEventData
                        @arguments(eventUser: $eventUser, eventPassword: $eventPassword)
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

        const creds = getCredentials("oc-event", id);
        const queryRef = loadQuery<VideoPageByOcIdInRealmQuery>(query, {
            id,
            realmPath,
            listId,
            eventUser: creds?.user,
            eventPassword: creds?.password,
        });

        return {
            render: () => <RootLoader
                {... { query, queryRef }}
                nav={data => data.realm ? <RealmNav fragRef={data.realm} /> : []}
                render={({ event, realm, playlist }) => {
                    if (!realm || (event && !event.isReferencedByRealm)) {
                        return <ForwardToDirectOcRoute ocID={id} />;
                    }

                    return <VideoPage
                        eventRef={event}
                        realmRef={realm}
                        playlistRef={playlist ?? null}
                        realmPath={realmPath}
                    />;
                }}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

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
            query VideoPageDirectLinkQuery(
                $id: ID!,
                $listId: ID!,
                $eventUser: String,
                $eventPassword: String
            ) {
                ... UserData
                event: eventById(id: $id) {
                    ... VideoPageEventData
                        @arguments(eventUser: $eventUser, eventPassword: $eventPassword)
                }
                realm: rootRealm {
                    ... VideoPageRealmData
                    ... NavigationData
                }
                playlist: playlistById(id: $listId) { ...PlaylistBlockPlaylistData }
            }
        `;
        const id = eventId(decodeURIComponent(params[1]));
        const creds = getCredentials("event", id);
        const queryRef = loadQuery<VideoPageDirectLinkQuery>(query, {
            id,
            listId: makeListId(url.searchParams.get("list")),
            eventUser: creds?.user,
            eventPassword: creds?.password,
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
            query VideoPageDirectOpencastLinkQuery(
                $id: String!,
                $listId: ID!,
                $eventUser: String,
                $eventPassword: String
            ) {
                ... UserData
                event: eventByOpencastId(id: $id) {
                    ... VideoPageEventData
                        @arguments(eventUser: $eventUser, eventPassword: $eventPassword)
                }
                realm: rootRealm {
                    ... VideoPageRealmData
                    ... NavigationData
                }
                playlist: playlistById(id: $listId) { ...PlaylistBlockPlaylistData }
            }
        `;
        const id = decodeURIComponent(matches[1]);
        const creds = getCredentials("oc-event", id);
        const queryRef = loadQuery<VideoPageDirectOpencastLinkQuery>(query, {
            id,
            listId: makeListId(url.searchParams.get("list")),
            eventUser: creds?.user,
            eventPassword: creds?.password,
        });

        return matchedDirectRoute(query, queryRef);
    },
});

// ===========================================================================================
// ===== Helper functions
// ===========================================================================================

const makeListId = (id: string | null) => id ? playlistId(id) : "";

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
        nav={data => data.realm ? <RealmNav fragRef={data.realm} /> : []}
        render={({ event, realm, playlist }) => <VideoPage
            eventRef={event}
            realmRef={realm ?? unreachable("root realm doesn't exist")}
            playlistRef={playlist ?? null}
            realmPath={null}
        />}
    />,
    dispose: () => queryRef.dispose(),
});

type RawEvent<T> =
    | ({ __typename: "AuthorizedEvent"} & T)
    | { __typename: "NotAllowed" }
    | { __typename: "%other" };

export const useEventWithAuthData = <T, >(
    event?: RawEvent<T & VideoPageAuthorizedData$key> | null,
): [
    RawEvent<T & { authorizedData: VideoPageAuthorizedData$data["authorizedData"] }>
        | undefined | null,
    RefetchFnDynamic<VideoPageInRealmQuery, VideoPageAuthorizedData$key>,
] => {
    const [data, refetch] = useRefetchableFragment(
        authorizedDataFragment,
        !event || event.__typename !== "AuthorizedEvent"
            ? null
            : event as VideoPageAuthorizedData$key,
    );

    if (!event || event.__typename !== "AuthorizedEvent") {
        return [event, refetch];
    }

    const patched = { ...event, authorizedData: notNullish(data).authorizedData };
    return [patched, refetch];
};


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
    fragment VideoPageEventData on Event
        @argumentDefinitions(
          eventUser: { type: "String", defaultValue: null },
          eventPassword: { type: "String", defaultValue: null },
        )
    {
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
            hasPassword
            syncedData {
                updated
                duration
                startTime
                endTime
                thumbnail
            }
            ... VideoPageAuthorizedData
                @arguments(eventUser: $eventUser, eventPassword: $eventPassword)
            series {
                id
                opencastId
                title
                ... SeriesBlockSeriesData
            }
        }
    }
`;

const authorizedDataFragment = graphql`
    fragment VideoPageAuthorizedData on AuthorizedEvent
        @refetchable(queryName: "VideoAuthorizedDataRefetchQuery")
        @argumentDefinitions(
            eventUser: { type: "String", defaultValue: null },
            eventPassword: { type: "String", defaultValue: null },
        )
    {
        authorizedData(user: $eventUser, password: $eventPassword) {
            tracks { uri flavor mimetype resolution isMaster }
            captions { uri lang }
            segments { uri startTime }
        }
    }
`;

// Custom query to refetch authorized event data manually. Unfortunately, using
// the fragment here is not enough, we need to also select `authorizedData`
// manually. Without that, we could not access that field below to check if the
// credentials were correct. Normally, adding `@relay(mask: false)` to the
// fragment should also fix that, but that does not work for some reason.
export const authorizedDataQuery = graphql`
    query VideoAuthorizedDataQuery(
        $id: ID!,
        $eventUser: String,
        $eventPassword: String,
    ) {
        node(id: $id) {
            __typename
            id
            ...VideoPageAuthorizedData
                @arguments(eventUser: $eventUser, eventPassword: $eventPassword)
            ...on AuthorizedEvent {
                authorizedData(user: $eventUser, password: $eventPassword) {
                    __id
                }
            }
        }
    }
`;


// ===========================================================================================
// ===== Components
// ===========================================================================================

type Props = {
    eventRef: NonNullable<VideoPageEventData$key> | null | undefined;
    realmRef: NonNullable<VideoPageRealmData$key>;
    playlistRef: PlaylistBlockPlaylistData$key | null;
    realmPath: string | null;
};

const VideoPage: React.FC<Props> = ({ eventRef, realmRef, playlistRef, realmPath }) => {
    const { t } = useTranslation();
    const rerender = useForceRerender();
    const realm = useFragment(realmFragment, realmRef);
    const protoEvent = useFragment(eventFragment, eventRef);
    const [event, refetch] = useEventWithAuthData(protoEvent);
    const breadcrumbs = realm.isMainRoot ? [] : realmBreadcrumbs(t, realm.ancestors.concat(realm));

    if (!event) {
        return <NotFound kind="video" breadcrumbsPath={breadcrumbs} />;
    }

    if (event.__typename === "NotAllowed") {
        return <ErrorPage title={t("api-remote-errors.view.event")} />;
    }
    if (event.__typename !== "AuthorizedEvent") {
        return unreachable();
    }
    if (!isSynced(event)) {
        return <WaitingPage type="video" />;
    }

    const { hasStarted, hasEnded } = getEventTimeInfo(event);
    const isCurrentlyLive = hasStarted === true && hasEnded === false;

    const structuredData: WithContext<VideoObject> = {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        name: event.title,
        description: event.description ?? undefined,
        thumbnailUrl: event.syncedData?.thumbnail ?? undefined,
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
            <section aria-label={t("video.video-player")}>
                {event.authorizedData
                    ? <InlinePlayer
                        event={{ ...event, authorizedData: event.authorizedData }}
                        css={{ margin: "-4px auto 0" }}
                        onEventStateChange={rerender}
                    />
                    : <PreviewPlaceholder {...{ event, refetch }}/>
                }
                <Metadata {...{ event, realmPath }} />
            </section>
        </PlayerContextProvider>

        <div css={{ height: 80 }} />

        {playlistRef
            ? <PlaylistBlockFromPlaylist
                moreOfTitle
                realmPath={realmPath}
                fragRef={playlistRef}
                activeEventId={event.id}
            />
            : event.series && <SeriesBlockFromSeries
                realmPath={realmPath}
                fragRef={event.series}
                title={t("video.more-from-series", { series: event.series.title })}
                activeEventId={event.id}
            />
        }
    </>;
};

type ProtectedPlayerProps = {
    event: Event | AuthorizedBlockEvent;
    embedded?: boolean;
    refetch: RefetchFnDynamic<VideoPageInRealmQuery, VideoPageAuthorizedData$key>;
}

export const PreviewPlaceholder: React.FC<ProtectedPlayerProps> = ({
    event, embedded, refetch,
}) => {
    const { t } = useTranslation();

    return event.hasPassword
        ? <ProtectedPlayer {...{ event, embedded, refetch }} />
        : <div css={{ height: "unset" }}>
            <PlayerPlaceholder>
                <p css={{
                    maxWidth: "80ch",
                    textWrap: "balance",
                    padding: 32,
                }}>
                    <LuInfo />
                    <div>{t("video.preview-only")}</div>
                </p>
            </PlayerPlaceholder>
        </div>;
};

export const CREDENTIALS_STORAGE_KEY = "tobira-video-credentials-";

const ProtectedPlayer: React.FC<ProtectedPlayerProps> = ({ event, embedded, refetch }) => {
    const { t } = useTranslation();
    const isDark = useColorScheme().scheme === "dark";
    const user = useUser();
    const [authState, setAuthState] = useState<AuthenticationFormState>("idle");
    const [authError, setAuthError] = useState<string | null>(null);
    const [triedSeries, setTriedSeries] = useState(false);

    const embeddedStyles = {
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
    };

    const tryCredentials = (creds: NonNullable<Credentials>, callbacks: {
        start?: () => void;
        error?: (e: Error) => void;
        eventAuthError?: () => void;
        incorrectCredentials?: () => void;
    }) => {
        const credentialVars = {
            eventUser: creds.user,
            eventPassword: creds.password,
        };
        fetchQuery<VideoAuthorizedDataQuery>(environment, authorizedDataQuery, {
            id: event.id,
            ...credentialVars,
        }).subscribe({
            start: callbacks.start,
            next: ({ node }) => {
                if (node?.__typename !== "AuthorizedEvent") {
                    callbacks.eventAuthError?.();
                    return;
                }

                if (!node.authorizedData) {
                    callbacks.incorrectCredentials?.();
                    return;
                }

                // This refetches the fragment, which actually makes the
                // components re-render with the new `authorizedData` value.
                // This does not actually send a network request as all data is
                // in the store (due to `fetchQuery` that was just executed).
                refetch(credentialVars, { fetchPolicy: "store-only" });


                // To make the authentication "sticky", the credentials are stored in browser
                // storage. If the user is logged in, local storage is used so the browser
                // stores them as long as the user stays logged in.
                // If the user is not logged in however, the session storage is used, which is
                // reset when the current tab or window is closed. This way we can be relatively
                // sure that the next user will need to enter the credentials again in order to
                // access a protected video.
                //
                // Furthermore, since the video route can be accessed via both kinds, this needs to
                // store both Tobira ID and Opencast ID. Both are queried when a video route is
                // accessed, but the check for already stored credentials is done in the same
                // query, when only the single ID from the url is known.
                // The check will return a result for either ID regardless of its kind, as long as
                // one of them is stored.
                const credentials = JSON.stringify({
                    // Explicitly listing fields here to keep storage format
                    // explicit and avoid accidentally changing it.
                    user: creds.user,
                    password: creds.password,
                });
                const storage = isRealUser(user) ? window.localStorage : window.sessionStorage;
                storage.setItem(credentialsStorageKey("event", event.id), credentials);
                storage.setItem(credentialsStorageKey("oc-event", event.opencastId), credentials);

                // We also store the series id of the event. If other events of that series use
                // the same credentials, they will also be unlocked.
                if (event.series?.id) {
                    storage.setItem(credentialsStorageKey("series", event.series.id), credentials);
                }
            },
            error: callbacks.error,
        });
    };

    // We also try the credentials we have associated with the series.
    // Unfortunately, we can only do that now and not in the beginning because
    // we don't know the series ID from the start.
    useEffect(() => {
        const seriesCredentials = event.series && getCredentials("series", event.series.id);
        if (!triedSeries && seriesCredentials) {
            setTriedSeries(true);
            tryCredentials(seriesCredentials, {});
        }
    });

    const onSubmit = (data: FormData) => {
        tryCredentials({ user: data.userid, password: data.password }, {
            start: () => setAuthState("pending"),
            error: (error: Error) => {
                setAuthError(error.message);
                setAuthState("idle");
            },
            eventAuthError: () => {
                setAuthError(t("video.password.no-preview-permission"));
                setAuthState("idle");
            },
            incorrectCredentials: () => {
                setAuthError(t("video.password.invalid-credentials"));
                setAuthState("idle");
            },
        });
    };

    return (
        <div css={{
            display: "flex",
            flexDirection: "column",
            color: isDark ? COLORS.neutral80 : COLORS.neutral15,
            backgroundColor: isDark ? COLORS.neutral15 : COLORS.neutral80,
            [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
                alignItems: "center",
            },
            ...embedded && embeddedStyles,
        }}>
            <h2 css={{
                margin: 32,
                marginBottom: 0,
                [screenWidthAbove(BREAKPOINT_MEDIUM)]: {
                    textAlign: "left",
                },
            }}>{t("video.password.heading")}</h2>
            <div css={{
                display: "flex",
                [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
                    flexDirection: "column-reverse",
                },
            }}>
                <div css={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                }}>
                    <AuthenticationForm
                        {...{ onSubmit }}
                        state={authState}
                        error={null}
                        SubmitIcon={LuLockOpen}
                        labels={{
                            user: t("video.password.label.id"),
                            password: t("general.password"),
                            submit: t("video.password.label.submit"),
                        }}
                        css={{
                            "&": { backgroundColor: "transparent" },
                            margin: 0,
                            border: 0,
                            width: "unset",
                            minWidth: 300,
                            "div > label, div > input": {
                                ...!isDark && {
                                    backgroundColor: COLORS.neutral15,
                                },
                            },
                        }}
                    />
                    {authError && (
                        <Card
                            kind="error"
                            iconPos="left"
                            css={{
                                width: "fit-content",
                                marginBottom: 32,
                            }}
                        >
                            {authError}
                        </Card>
                    )}
                </div>
                <AuthenticationFormText />
            </div>
        </div>
    );
};

const AuthenticationFormText: React.FC = () => {
    const { t } = useTranslation();
    const isDark = useColorScheme().scheme === "dark";

    return <div css={{
        textAlign: "left",
        maxWidth: "60ch",
        padding: 32,
        paddingLeft: 8,
        fontSize: 14,
        "&& p": {
            color: isDark ? COLORS.neutral80 : COLORS.neutral15,
        },
        [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
            padding: "6px 18px 0px",
            textAlign: "center",
            textWrap: "balance",
        },
    }}>
        <p>
            <span css={{
                [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
                    display: "none",
                },
            }}>
                <b>{t("video.password.sub-heading")}</b>
                <br/>
            </span>
            {t("video.password.body")}
        </p>
    </div>;
};

type Event = Extract<NonNullable<VideoPageEventData$data>, { __typename: "AuthorizedEvent" }>;
type SyncedEvent = SyncedOpencastEntity<Event> & {
    authorizedData?: VideoPageAuthorizedData$data["authorizedData"];
};

type MetadataProps = {
    event: SyncedEvent;
    realmPath: string | null;
};

const Metadata: React.FC<MetadataProps> = ({ event, realmPath }) => {
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
            <section aria-label={t("video.extra-buttons")} css={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                "> button": { ...shrinkOnMobile },
            }}>
                {event.canWrite && user !== "none" && user !== "unknown" && (
                    <LinkButton to={ManageVideoDetailsRoute.url({ videoId: event.id })} css={{
                        "&:not([disabled])": { color: COLORS.primary0 },
                        ...shrinkOnMobile,
                    }}>
                        <LuSettings size={16} />
                        {t("user.manage")}
                    </LinkButton>
                )}
                {CONFIG.showDownloadButton && event.authorizedData && (
                    <DownloadButton event={event} />
                )}
                <VideoShareButton {...{ event }} />
            </section>
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
                <MetadataTable {...{ event, realmPath }} />
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

const VideoShareButton: React.FC<{ event: SyncedEvent }> = ({ event }) => {
    const { t } = useTranslation();
    const [timestamp, setTimestamp] = useState(0);
    const [addLinkTimestamp, setAddLinkTimestamp] = useState(false);
    const [addEmbedTimestamp, setAddEmbedTimestamp] = useState(false);
    const { paella, playerIsLoaded } = usePlayerContext();

    const timeStringPattern = /\?t=(\d+h)?(\d+m)?(\d+s)?/;

    const series = event.series;
    const tabs = {
        "main": {
            label: t("share.link"),
            Icon: LuLink,
            render: () => {
                let url = window.location.href.replace(timeStringPattern, "");
                url += addLinkTimestamp && timestamp
                    ? `?t=${secondsToTimeString(timestamp)}`
                    : "";

                return <>
                    <div>
                        <CopyableInput
                            label={t("share.copy-direct-link-to-clipboard")}
                            value={url}
                        />
                        {!event.isLive && <TimeInputWithCheckbox
                            checkboxChecked={addLinkTimestamp}
                            setCheckboxChecked={setAddLinkTimestamp}
                            {...{ timestamp, setTimestamp }}
                        />}
                    </div>
                    <QrCodeButton target={url} label={t("share.link")} />
                </>;
            },
        },
        "embed": {
            label: t("share.embed"),
            Icon: LuCode,
            render: () => {
                const ar = event.authorizedData == null
                    ? [16, 9]
                    : getPlayerAspectRatio(event.authorizedData.tracks);

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
                            label={t("share.copy-embed-code")}
                            value={embedCode}
                            multiline
                            css={{ height: 75 }}
                        />
                        {!event.isLive && <TimeInputWithCheckbox
                            checkboxChecked={addEmbedTimestamp}
                            setCheckboxChecked={setAddEmbedTimestamp}
                            {...{ timestamp, setTimestamp }}
                        />}
                    </div>
                    <QrCodeButton target={embedCode} label={t("share.embed")} />
                </>;
            },
        },
        ...series && {
            "rss": {
                label: t("share.rss"),
                Icon: LuRss,
                render: () => {
                    const rssUrl = window.location.origin
                        + `/~rss/series/${keyOfId(series.id)}`;
                    return <>
                        <CopyableInput label={t("share.copy-rss")} value={rssUrl} />
                        <QrCodeButton target={rssUrl} label={t("share.rss")} />
                    </>;
                },
            },
        },
    };

    const onOpen = () => {
        if (playerIsLoaded) {
            paella.current?.player.videoContainer.currentTime().then(res => {
                setTimestamp(res);
            });
        }
    };

    return <ShareButton {...{ tabs, onOpen }} height={250} />;
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

    const { created, updated, startTime, endTime, hasEnded } = getEventTimeInfo(event);

    const locale = preferredLocaleForLang(i18n.language);
    const prettyDateProps = event.isLive && hasEnded
        ? { date: endTime, prefixKind: "end" as const }
        : { date: startTime ?? created };
    const fields: [string, Date | null][] = [
        [t("video.started"), startTime],
        [t("video.ended"), endTime],
        [t("video.created"), created],
        [t("manage.table.updated"), updated],
    ];

    const tooltip = <table css={{}}>
        <tbody>
            {fields.map(([label, date], i) => date && <tr key={i}>
                <td css={{ fontStyle: "italic", textAlign: "right" }}>{label}</td>
                <td css={{ paddingLeft: 12 }}>{preciseDateTime(date, locale)}</td>
            </tr>)}
        </tbody>
    </table>;

    return (
        <div css={{
            display: "inline-block",
            position: "relative",
            color: COLORS.neutral60,
            fontSize: 14,
        }}>
            <WithTooltip distance={0} tooltip={tooltip}>
                <div>
                    <PrettyDate
                        {...prettyDateProps}
                        isLive={event.isLive}
                        noTooltip
                        alwaysShowTime
                    />
                </div>
            </WithTooltip>
        </div>
    );
};

type MetadataTableProps = {
    event: Event;
    realmPath: string | null;
};

const MetadataTable = React.forwardRef<HTMLDListElement, MetadataTableProps>(({
    event, realmPath,
}, ref) => {
    const { t, i18n } = useTranslation();
    const pairs: [string, ReactNode][] = [];

    if (event.series) {
        const seriesId = event.series.id;
        const target = realmPath == null
            ? DirectSeriesRoute.url({ seriesId })
            : SeriesRoute.url({ seriesId, realmPath });
        pairs.push([
            t("video.part-of-series"),
            // eslint-disable-next-line react/jsx-key
            <Link to={target}>
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
