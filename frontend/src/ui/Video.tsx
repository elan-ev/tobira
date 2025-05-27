import { PropsWithChildren, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuTriangleAlert, LuFilm, LuRadio, LuTrash, LuCircleUser, LuVolume2 } from "react-icons/lu";
import { useColorScheme } from "@opencast/appkit";

import { COLORS } from "../color";


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
    };

    /** If `true`, an indicator overlay is shown */
    active?: boolean;

    /** If `true`, a special icon is shown instead of the thumbnail */
    deletionIsPending?: boolean;
};

export const Thumbnail: React.FC<ThumbnailProps> = ({
    event,
    active = false,
    deletionIsPending = false,
    ...rest
}) => {
    const { t } = useTranslation();
    const isDark = useColorScheme().scheme === "dark";
    const isUpcoming = isUpcomingLiveEvent(event.syncedData?.startTime ?? null, event.isLive);

    let inner;
    if (event.syncedData?.thumbnail && !deletionIsPending) {
        // We have a proper thumbnail.
        inner = <ThumbnailImg
            src={event.syncedData.thumbnail}
            alt={t("video.thumbnail-for", { video: event.title })}
        />;
    } else {
        inner = <ThumbnailReplacement audioOnly={event.syncedData?.audioOnly} {...{
            isUpcoming, isDark, deletionIsPending,
        }}/>;
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
    isUpcoming?: boolean;
    deletionIsPending?: boolean;
}
export const ThumbnailReplacement: React.FC<ThumbnailReplacementProps> = (
    { audioOnly, isDark, isUpcoming, deletionIsPending },
) => {
    // We have no thumbnail. If the resolution is `null` as well, we are
    // dealing with an audio-only event and show an appropriate icon.
    // Otherwise we use a generic icon.
    // If the event has been marked as deleted, the other criteria are
    // ignored and an icon that indicates deletion is shown instead.
    let icon = <LuFilm />;
    if (audioOnly) {
        icon = <LuVolume2 />;
    }
    if (deletionIsPending) {
        icon = <LuTrash />;
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
            background: isUpcoming
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

    return <div css={{
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
    }} {...rest}>
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
