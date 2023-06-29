import React, { ReactElement, ReactNode, useEffect, useRef, useState } from "react";
import { graphql, GraphQLTaggedNode, PreloadedQuery, useFragment } from "react-relay/hooks";
import { useTranslation } from "react-i18next";
import { OperationType } from "relay-runtime";
import {
    FiCode, FiSettings, FiShare2, FiDownload,
} from "react-icons/fi";
import { HiLink } from "react-icons/hi";
import { HiOutlineQrCode } from "react-icons/hi2";
import { QRCodeCanvas } from "qrcode.react";

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
    match,
    currentRef,
} from "../util";
import { unreachable } from "../util/err";
import { BREAKPOINT_SMALL, BREAKPOINT_MEDIUM } from "../GlobalStyle";
import { Button, LinkButton, ProtoButton } from "../ui/Button";
import CONFIG from "../config";
import { Link, useRouter } from "../router";
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
import { Creators, formatDuration } from "../ui/Video";
import { Description } from "../ui/metadata";
import { ellipsisOverflowCss, focusStyle } from "../ui";
import { Floating, FloatingContainer, FloatingTrigger, WithTooltip } from "../ui/Floating";
import { Card } from "../ui/Card";
import { realmBreadcrumbs } from "../util/realm";
import { VideoObject, WithContext } from "schema-dts";
import { TrackInfo } from "./manage/Video/TechnicalDetails";
import { COLORS, useColorScheme } from "../color";
import { RelativeDate } from "../ui/time";
import { Modal, ModalHandle } from "../ui/Modal";


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
    if (!isValidRealmPath(realmPathParts)) {
        return null;
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
            render={({ event, realm }) => {
                if (!event) {
                    return <NotFound kind="video" />;
                }

                if (!realm || !realm.referencesVideo) {
                    return <ForwardToDirectRoute videoId={videoId} />;
                }

                return <VideoPage
                    eventRef={event}
                    realmRef={realm}
                    basePath={realmPath.replace(/\/$/u, "") + "/v"}
                />;
            }}
        />,
        dispose: () => queryRef.dispose(),
    };
});

const ForwardToDirectRoute: React.FC<{ videoId: string }> = ({ videoId }) => {
    const router = useRouter();
    useEffect(() => router.goto(`/!v/${videoId}`));
    return <InitialLoading />;
};

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

    const shrinkOnMobile = {
        [`@media (max-width: ${BREAKPOINT_SMALL}px)`]: {
            padding: "5px 10px",
            gap: 10,
        },
    };

    const descriptionRef = useRef<HTMLDivElement>(null);
    const descriptionContainerRef = useRef<HTMLDivElement>(null);

    const [expanded, setExpanded] = useState(false);
    const [showButton, setShowButton] = useState(false);

    const resizeObserver = new ResizeObserver(() => {
        if (descriptionRef.current && descriptionContainerRef.current) {
            setShowButton(
                descriptionRef.current.scrollHeight > descriptionContainerRef.current.offsetHeight
                || expanded,
            );
        }
    });

    useEffect(() => {
        if (descriptionRef.current) {
            resizeObserver.observe(descriptionRef.current);
        }

        return () => resizeObserver.disconnect();
    });

    const InnerDescription: React.FC<({ truncated?: boolean })> = ({ truncated = false }) => <>
        <Creators creators={event.creators} css={{
            fontWeight: "bold",
            marginBottom: 12,
        }} />
        <Description
            text={event.description}
            css={{
                color: COLORS.grey7,
                fontSize: 14,
                maxWidth: "90ch",
                ...truncated && ellipsisOverflowCss(6),
            }}
        />
    </>;

    const sharedStyle = {
        padding: "20px 22px",
        ...showButton && { paddingBottom: 26 },
    };

    return <>
        <div css={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "space-between",
            marginTop: 24,
            marginBottom: 16,
            gap: 8,
        }}>
            <div>
                <VideoTitle title={event.title} />
                <VideoDate event={event} />
            </div>
            {/* Buttons */}
            <div css={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                "> button": { ...shrinkOnMobile },
            }}>
                {event.canWrite && user !== "none" && user !== "unknown" && (
                    <LinkButton to={`/~manage/videos/${id.slice(2)}`} css={{
                        "&:not([disabled])": { color: COLORS.primary0 },
                        ...shrinkOnMobile,
                    }}>
                        <FiSettings size={16} />
                        {t("video.manage")}
                    </LinkButton>
                )}
                {CONFIG.showDownloadButton && <DownloadButton event={event} />}
                <ShareButton event={event} />
            </div>
        </div>
        <div css={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            "> div": {
                backgroundColor: COLORS.grey1,
                borderRadius: 8,
                [`@media (max-width: ${BREAKPOINT_MEDIUM}px)`]: {
                    overflowWrap: "anywhere",
                },
            },
        }}>
            <div ref={descriptionContainerRef} css={{
                flex: event.description ? "1 400px" : "1 200px",
                alignSelf: "flex-start",
                position: "relative",
                overflow: "hidden",
            }}>
                <div ref={descriptionRef} css={{
                    position: expanded ? "initial" : "absolute",
                    top: 0,
                    left: 0,
                    ...sharedStyle,
                }}><InnerDescription /></div>
                <div css={{
                    visibility: "hidden",
                    ...sharedStyle,
                    ...expanded && { display: "none" },
                }}><InnerDescription truncated /></div>
                <div css={{
                    ...!showButton && { display: "none" },
                    ...!expanded && {
                        background: `linear-gradient(transparent, ${COLORS.grey1} 60%)`,
                    },
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    paddingTop: 30,
                }}>
                    <ProtoButton onClick={() => setExpanded(b => !b)} css={{
                        textAlign: "center",
                        width: "100%",
                        fontSize: 12,
                        padding: "4px 0",
                        borderRadius: "0 0 8px 8px",
                        ":hover, :focus-visible": { backgroundColor: COLORS.grey2 },
                        ...focusStyle({ inset: true }),
                    }}>
                        {expanded
                            ? t("video.description.show-less")
                            : t("video.description.show-more")
                        }
                    </ProtoButton>
                </div>
            </div>
            <div css={{ flex: "1 200px", alignSelf: "flex-start", padding: "20px 22px" }}>
                <MetadataTable event={event} />
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
            <FloatingTrigger>
                <Button>
                    <FiDownload size={16}/>
                    {t("video.download.title")}
                </Button>
            </FloatingTrigger>
            <Floating
                backgroundColor={isDark ? COLORS.grey2 : COLORS.background}
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
    type State = "closed" | "main" | "embed" | "rss";
    /* eslint-disable react/jsx-key */
    const entries: [Exclude<State, "closed">, ReactElement][] = [
        ["main", <HiLink />],
        ["embed", <FiCode />],
        // ["rss", <FiRss />],
    ];
    /* eslint-enable react/jsx-key */

    const { t } = useTranslation();
    const [state, setState] = useState<State>("closed");
    const isDark = useColorScheme().scheme === "dark";
    const ref = useRef(null);
    const qrModalRef = useRef<ModalHandle>(null);

    const isActive = (label: State) => label === state;

    const tabStyle = {
        display: "flex",
        flexDirection: "column",
        flex: `1 calc(100% / ${entries.length})`,
        backgroundColor: COLORS.grey3,
        paddingBottom: 4,
        cursor: "pointer",
        alignItems: "center",
        borderRight: `1px solid ${COLORS.grey5}`,
        borderTop: "none",
        borderBottom: `1px solid ${COLORS.grey5}`,
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
            backgroundColor: isDark ? COLORS.grey2 : COLORS.background,
            borderBottom: "none",
            svg: { color: COLORS.primary0 },
        },
        ":not([disabled])": {
            "&:hover": { backgroundColor: COLORS.grey2 },
        },
        ...focusStyle({ inset: true }),

        // By using the `has()` selector, these styles only get applied
        // to non-firefox browsers. Once firefox supports that selector,
        // this border radius stuff should get refactored.
        ":has(svg)": {
            "&[disabled]": {
                borderRight: "none",
                "+ button": {
                    borderLeft: `1px solid ${COLORS.grey5}`,
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
                onClick={() => setState(label)}
                css={tabStyle}
            >
                {icon}
                {t(`video.share.${label}`)}
            </ProtoButton>
        ))}
    </div>;

    const ShowQRCodeButton: React.FC<{ target: string; label: State }> = ({ target, label }) => <>
        <Button
            onClick={() => currentRef(qrModalRef).open()}
            css={{ width: "max-content" }}
        >
            <HiOutlineQrCode />
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

    const inner = match(state, {
        "closed": () => null,
        "main": () => <>
            <CopyableInput
                label={t("manage.my-videos.details.copy-direct-link-to-clipboard")}
                css={{ fontSize: 14, width: 400 }}
                // TODO
                value={window.location.href}
            />
            <ShowQRCodeButton target={window.location.href} label={state} />
        </>,
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
                <CopyableInput
                    label={t("video.embed.copy-embed-code-to-clipboard")}
                    value={embedCode}
                    multiline
                    css={{ fontSize: 14, width: 400 }}
                />
                <ShowQRCodeButton target={embedCode} label={state} />
            </>;
        },
        "rss": () => {
            // TODO
            const dummy = "Implement me!";
            return <>{dummy}</>;
        },
    });


    return (
        <FloatingContainer
            ref={ref}
            placement="top"
            arrowSize={12}
            ariaRole="dialog"
            open={state !== "closed"}
            onClose={() => setState("closed")}
            viewPortMargin={12}
        >
            <FloatingTrigger>
                <Button onClick={() => setState(state => state === "closed" ? "main" : "closed")}>
                    <FiShare2 size={16} />
                    {t("general.share")}
                </Button>
            </FloatingTrigger>
            <Floating
                padding={0}
                backgroundColor={isDark ? COLORS.grey2 : COLORS.background}
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
                ? t("video.started-generic")
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
                ? <><i>{t("video.started-generic")}</i>: {startFull}</>
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
            color: COLORS.grey6,
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

    if (event.series !== null) {
        pairs.push([
            t("video.part-of-series"),
            // eslint-disable-next-line react/jsx-key
            <Link to={`/!s/${event.series.id.slice(2)}`}>{event.series.title}</Link>,
        ]);
    }

    if (event.metadata.dcterms.language) {
        const languageNames = new Intl.DisplayNames(i18n.resolvedLanguage, { type: "language" });
        const languages = event.metadata.dcterms.language.map(lng => languageNames.of(lng) ?? lng);

        pairs.push([
            t("video.language", { count: languages.length }),
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

    if (event.syncedData?.duration) {
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
                color: COLORS.grey6,
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
