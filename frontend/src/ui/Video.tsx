import { Fragment, PropsWithChildren, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuTriangleAlert, LuFilm, LuRadio, LuTrash, LuCircleUser, LuVolume2 } from "react-icons/lu";
import { Spinner, useColorScheme } from "@opencast/appkit";

import { COLORS } from "../color";
import { MovingTruck } from "./Waiting";
import { AuthorizedEvent } from "../routes/manage/Video/Shared";
import { Caption } from "./player";
import { captionsWithLabels } from "../util";
import { graphql } from "react-relay";
import { fetchQuery } from "../relay";
import { VideoStaticFileLinkQuery } from "./__generated__/VideoStaticFileLinkQuery.graphql";
import CONFIG from "../config";


export type ThumbnailItemState
    = "READY" | "WAITING" | "UPCOMING" | "DELETED" | "%future added value";

type ThumbnailProps = JSX.IntrinsicElements["div"] & {
    /** The event of which a thumbnail should be shown */
    event: {
        title: string;
        isLive: boolean;
        created: string;
        syncedData?: {
            duration: number;
            thumbnail?: string | null;
            startTime?: string | null;
            endTime?: string | null;
            audioOnly?: boolean;
        } | null;
        tobiraDeletionTimestamp?: string | null;
    };

    /** If `true`, an indicator overlay is shown */
    active?: boolean;
};

export const Thumbnail: React.FC<ThumbnailProps> = ({ event, active, ...rest }) => {
    const { t } = useTranslation();
    const isDark = useColorScheme().scheme === "dark";
    const isUpcoming = isUpcomingLiveEvent(event.syncedData?.startTime ?? null, event.isLive);
    const deletionIsPending = event.tobiraDeletionTimestamp != null;

    let videoState: ThumbnailItemState = "READY";
    if (isUpcoming) {
        videoState = "UPCOMING";
    }
    if (!event.syncedData) {
        videoState = "WAITING";
    }
    if (deletionIsPending) {
        videoState = "DELETED";
    }

    let inner;
    if (!event.syncedData?.thumbnail || videoState !== "READY") {
        inner = <ThumbnailReplacement
            audioOnly={event.syncedData?.audioOnly}
            {...{ videoState, isDark }}
        />;
    } else {
        // We have a proper thumbnail.
        inner = <ThumbnailImg
            src={event.syncedData.thumbnail}
            alt={t("video.thumbnail-for", { video: event.title })}
        />;
    }

    let overlay;
    if (deletionIsPending) {
        overlay = null;
    } else if (event.isLive) {
        // TODO: we might want to have a better "is currently live" detection.
        const now = new Date();
        const startTime = new Date(event.syncedData?.startTime ?? event.created);
        const endTime = event.syncedData?.endTime;
        const hasEnded = endTime == null ? null : new Date(endTime) < now;
        const hasStarted = startTime < now;
        const currentlyLive = hasStarted && !hasEnded;

        let innerOverlay;
        if (hasEnded) {
            innerOverlay = t("video.ended");
        } else if (hasStarted) {
            innerOverlay = <>
                <LuRadio css={{ fontSize: 19, strokeWidth: 1.4 }} />
                {t("video.live")}
            </>;
        } else {
            innerOverlay = t("video.upcoming");
        }

        const backgroundColor = currentlyLive ? "rgba(200, 0, 0, 0.9)" : "hsla(0, 0%, 0%, 0.75)";

        overlay = <ThumbnailOverlay {...{ backgroundColor }}>
            {innerOverlay}
        </ThumbnailOverlay>;
    } else if (event.syncedData) {
        overlay = <ThumbnailOverlay backgroundColor="hsla(0, 0%, 0%, 0.75)">
            {formatDuration(event.syncedData.duration)}
        </ThumbnailOverlay>;
    }

    return <ThumbnailOverlayContainer {...rest}>
        {inner}
        {active && <ActiveIndicator />}
        {overlay}
    </ThumbnailOverlayContainer>;
};

type ThumbnailReplacementProps = {
    audioOnly?: boolean;
    isDark: boolean;
    videoState: ThumbnailItemState;
}
export const ThumbnailReplacement: React.FC<ThumbnailReplacementProps> = ({
    videoState,
    audioOnly,
    isDark,
}) => {
    const deletionIsPending = videoState === "DELETED";
    // We have no thumbnail. If the resolution is `null` as well, we are
    // dealing with an audio-only event and show an appropriate icon.
    // Otherwise we use a generic icon.
    // If the event has been marked as deleted, the other criteria are
    // ignored and an icon that indicates deletion is shown instead, and
    // if the event is waiting for processing, a truck icon is shown.
    let icon = <LuFilm />;
    if (audioOnly) {
        icon = <LuVolume2 />;
    }
    if (deletionIsPending) {
        icon = <LuTrash css={{ color: COLORS.danger1 }} />;
    }
    if (videoState === "WAITING") {
        icon = <MovingTruck />;
    }

    return <BaseThumbnailReplacement css={{
        ...!deletionIsPending && {
            background: "linear-gradient(135deg, #33333380 50%, transparent 0),"
                + "linear-gradient(-135deg, #33333380 50%, transparent 0)",
        },
        backgroundSize: "17px 17px",
        color: "#dbdbdb",
        backgroundColor: !deletionIsPending ? "#292929" : COLORS.neutral50,
        ...isDark && !deletionIsPending && {
            backgroundColor: "#313131",
            background: videoState === "UPCOMING"
                ? "linear-gradient(135deg, #48484880 50%, transparent 0),"
                    + "linear-gradient(-135deg, #48484880 50%, transparent 0)"
                : "linear-gradient(135deg, #3e3e3e80 50%, transparent 0),"
                    + "linear-gradient(-135deg, #3e3e3e80 50%, transparent 0)",
        },
    }}>{icon}</BaseThumbnailReplacement>;
};

type BaseThumbnailReplacementProps = PropsWithChildren<{
    className?: string;
}>;
export const BaseThumbnailReplacement: React.FC<BaseThumbnailReplacementProps> = ({
    children,
    className,
}) => (
    <div {...{ className }} css={{
        display: "flex",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 40,
    }}>{children}</div>
);

type ThumbnailOverlayProps = PropsWithChildren<{
    backgroundColor: string;
}>;
export const ThumbnailOverlay: React.FC<ThumbnailOverlayProps> = ({
    children,
    backgroundColor,
}) => (
    <div css={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        position: "absolute",
        right: 6,
        bottom: 6,
        borderRadius: 4,
        padding: "1px 5px",
        fontSize: 14,
        backgroundColor,
        color: "white",
        "@container thumbnail (width < 110px)": {
            fontSize: 12,
            " > svg": { fontSize: 15 },
        },
    }}>
        {children}
    </div>
);

export const ThumbnailOverlayContainer: React.FC<JSX.IntrinsicElements["div"]> = ({
    children,
    ...rest
}) => {
    const isDark = useColorScheme().scheme === "dark";

    return <div {...rest} css={{
        container: "thumbnail / inline-size",
        position: "relative",
        transition: "0.2s box-shadow",
        overflow: "hidden",
        height: "fit-content",
        borderRadius: 8,
        aspectRatio: "16 / 9",
        ...isDark && {
            img: {
                filter: "brightness(90%)",
                transition: "0.1s filter",
            },
        },
    }}>
        {children}
    </div>;
};

const ActiveIndicator = () => (
    <div css={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(255, 255, 255, 0.3)",
        borderRadius: 8,
    }} />
);


/**
 * Takes a video duration in milliseconds and returns a formatted string in
 * `HH:MM:SS` or `MM:SS` format.
 */
export const formatDuration = (totalMs: number): string => {
    const totalSeconds = Math.round(totalMs / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / (60 * 60));

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

    if (hours > 0) {
        return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    } else {
        return `${minutes}:${pad(seconds)}`;
    }
};

export const isPastLiveEvent = (endTime: string | null, isLive: boolean): boolean =>
    isLive && endTime != null && new Date(endTime) < new Date();

export const isUpcomingLiveEvent = (startingTime: string | null, isLive: boolean): boolean =>
    isLive && startingTime != null && new Date(startingTime) > new Date();

export const ThumbnailImg: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
    const { t } = useTranslation();
    const [loadError, setLoadError] = useState(false);

    return loadError
        ? <div css={{
            backgroundColor: COLORS.neutral60,
            aspectRatio: "16 / 9",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            justifyContent: "center",
            alignItems: "center",
            color: COLORS.neutral15,
            fontSize: 14,
            "& > svg": {
                fontSize: 32,
                color: COLORS.neutral25,
                strokeWidth: 1.5,
            },
        }}>
            <LuTriangleAlert />
            {t("general.failed-to-load-thumbnail")}
        </div>
        : <img
            {...{ src, alt }}
            onError={() => setLoadError(true)}
            loading="lazy"
            width={16}
            height={9}
            css={{
                display: "block",
                width: "100%",
                height: "100%",
                objectFit: "contain",
                backgroundColor: "black",
            }}
        />;
};

type CreatorsProps = {
    creators: readonly (JSX.Element | string)[] | null;
    className?: string;
};

/**
 * Shows a list of creators (of a video) separated by '•' with a leading user
 * icon. If the given creators are null or empty, renders nothing.
 */
export const Creators: React.FC<CreatorsProps> = ({ creators, className }) => (
    creators == null || creators.length === 0
        ? null
        : <div
            css={{
                display: "flex",
                alignItems: "center",
                fontSize: 14,
                gap: 8,
            }}
            {...{ className }}
        >
            <LuCircleUser css={{
                color: COLORS.neutral60,
                fontSize: 16,
                flexShrink: 0,
            }} />
            <ul css={{
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
                {creators.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
        </div>
);


type TrackInfoProps = {
    event: {
        id: string;
        authorizedData?: null | {
            tracks: NonNullable<AuthorizedEvent["authorizedData"]>["tracks"];
            captions: readonly Caption[];
        };
    };
    translateFlavors?: boolean;
};

export const TrackInfo: React.FC<TrackInfoProps> = (
    { event, translateFlavors = false },
) => {
    const { t } = useTranslation();

    if (event.authorizedData == null) {
        return null;
    }


    const flavorTranslation = (flavor: string) => {
        if (flavor.startsWith("presenter")) {
            return t("video.download.presenter");
        }
        if (flavor.startsWith("presentation")) {
            return t("video.download.slides");
        }
        return flavor;
    };

    const flavors: Map<string, SingleTrackInfo[]> = new Map();
    for (const { flavor, resolution, mimetype, uri } of event.authorizedData.tracks) {
        let tracks = flavors.get(flavor);
        if (tracks === undefined) {
            tracks = [];
            flavors.set(flavor, tracks);
        }

        tracks.push({ resolution, mimetype, uri, eventId: event.id });
    }

    const isSingleFlavor = flavors.size === 1;

    return <ul css={{ fontSize: 15, marginBottom: 4, paddingLeft: 24 }}>
        {Array.from(flavors, ([flavor, tracks]) => {
            const trackItems = tracks
                .sort((a, b) => (a.resolution?.[0] ?? 0) - (b.resolution?.[0] ?? 0))
                .map((track, i) => <TrackItem key={i} {...track} />);
            const flavorLabel = translateFlavors
                ? flavorTranslation(flavor)
                : <code>{flavor}</code>;
            const flat = isSingleFlavor && translateFlavors;

            return <Fragment key={flavor}>
                {flat ? trackItems : <li>{flavorLabel}<ul>{trackItems}</ul></li>}
            </Fragment>;
        })}
        <VTTInfo captions={event.authorizedData.captions} eventId={event.id} />
    </ul>;
};


type SingleTrackInfo = {
    resolution?: readonly number[] | null;
    mimetype?: string | null;
    uri: string;
    eventId: string;
};

const TrackItem: React.FC<SingleTrackInfo> = ({ mimetype, resolution, uri, eventId }) => {
    const { t } = useTranslation();
    const type = mimetype && mimetype.split("/")[0];
    const subtype = mimetype && mimetype.split("/")[1];
    const typeTranslation = (type === "audio" || type === "video")
        ? t(`manage.video.technical-details.${type}`)
        : type;

    const resolutionString = (type && " ")
        + "("
        + [subtype, resolution?.join(" × ")].filter(Boolean).join(", ")
        + ")";

    return (
        <li css={{ marginBottom: 4 }}>
            <StaticFileLink link={uri} event={eventId}>
                {type
                    ? <>{typeTranslation}</>
                    : <i>{t("manage.video.technical-details.unknown-mimetype")}</i>
                }
                {(resolution || subtype) && resolutionString}
            </StaticFileLink>
        </li>
    );
};

type VTTInfoProps = {
    captions: readonly Caption[];
    eventId: string;
};

const VTTInfo: React.FC<VTTInfoProps> = ({ captions, eventId }) => {
    const { t } = useTranslation();

    return <>{captionsWithLabels(captions, t).map(({ caption, label }) =>
        <li key={label}>
            <StaticFileLink link={caption.uri} event={eventId}>
                {label}
            </StaticFileLink>
        </li>)
    }</>;
};

type StaticFileLinkProps = React.PropsWithChildren<{
    event: string;
    link: string;
}>;

const StaticFileLink: React.FC<StaticFileLinkProps> = ({ event, link, children }) => {
    const [pending, setPending] = useState(false);

    const buildLink = () => {
        const query = graphql`
            query VideoStaticFileLinkQuery($id: ID!) {
                eventById(id:$id) {
                    ...on AuthorizedEvent { jwtForDownload }
                }
            }
        `;
        fetchQuery<VideoStaticFileLinkQuery>(query, { id: event }, { fetchPolicy: "network-only" })
            .subscribe({
                start: () => setPending(true),
                complete: () => setPending(false),
                error: () => setPending(false),
                next: data => {
                    const elem = document.createElement("a");
                    const url = new URL(link);
                    if (data.eventById?.jwtForDownload) {
                        url.searchParams.set("jwt", data.eventById.jwtForDownload);
                    }
                    url.searchParams.set("download", "1");
                    elem.href = url.toString();
                    elem.target = "_blank";
                    elem.click();
                },
            });
    };

    return (
        <a {...CONFIG.auth.authStaticFiles ? {
            onClick: buildLink,
            css: {
                cursor: "pointer",
            },
        } : {
            href: link,
        }}>
            {children}
            {pending && <Spinner css={{
                verticalAlign: "middle",
                marginLeft: 8,
            }} />}
        </a>
    );
};
