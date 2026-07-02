import { PropsWithChildren, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuTriangleAlert, LuFilm, LuRadio, LuTrash, LuVolume2 } from "react-icons/lu";
import { screenWidthAtMost, useColorScheme } from "@opencast/appkit";

import { COLORS } from "../color";
import { MovingTruck } from "./Waiting";
import { AccessIcon } from "../util";
import { BREAKPOINT_SMALL } from "../GlobalStyle";
import { formatDuration, isUpcomingLiveEvent } from "./Video";


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
        // Pass these if you want to show an access indicating icon inside the thumbnail.
        readRoles?: readonly string[];
        writeRoles?: readonly string[];
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

    return (
        <ThumbnailOverlayContainer
            accessRoles={(event.readRoles && event.writeRoles) ? {
                readRoles: event.readRoles,
                writeRoles: event.writeRoles,
            } : undefined}
            {...rest}
        >
            {inner}
            {active && <ActiveIndicator />}
            {overlay}
        </ThumbnailOverlayContainer>
    );
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

export const thumbnailOverlayStyles = ({
    display: "inline-flex",
    borderRadius: 4,
    fontSize: 14,
    color: "white",
    [screenWidthAtMost(BREAKPOINT_SMALL)]: {
        fontSize: 12,
        " > svg": { fontSize: 15 },
    },
});

type ThumbnailOverlayProps = PropsWithChildren<{
    backgroundColor: string;
}>;
export const ThumbnailOverlay: React.FC<ThumbnailOverlayProps> = ({
    children,
    backgroundColor,
}) => (
    <div css={{
        alignItems: "center",
        gap: 6,
        position: "absolute",
        right: 6,
        bottom: 6,
        backgroundColor,
        padding: "1px 5px",
        ...thumbnailOverlayStyles,
    }}>
        {children}
    </div>
);


type ThumbnailOverlayContainerProps = JSX.IntrinsicElements["div"] & {
    accessRoles?: {
        readRoles: readonly string[];
        writeRoles: readonly string[];
    },
}
export const ThumbnailOverlayContainer: React.FC<ThumbnailOverlayContainerProps> = ({
    accessRoles,
    children,
    ...rest
}) => {
    const isDark = useColorScheme().scheme === "dark";

    return <div {...rest} css={{
        position: "relative",
        transition: "0.2s box-shadow",
        overflow: "visible",
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
        <div css={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            borderRadius: 8,
            zIndex: 0,
        }}>
            {children}
        </div>
        {accessRoles && <div css={{
            position: "absolute",
            top: 2,
            right: 2,
            fontSize: 16,
            padding: 2,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1,
        }}>
            <AccessIcon item={accessRoles} />
        </div>}
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
