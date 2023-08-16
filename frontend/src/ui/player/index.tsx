import React, { PropsWithChildren, Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FiClock } from "react-icons/fi";
import { HiOutlineStatusOffline } from "react-icons/hi";
import { BREAKPOINT_MEDIUM } from "../../GlobalStyle";
import { match, screenWidthAtMost, useColorScheme } from "@opencast/appkit";

import { MAIN_PADDING } from "../../layout/Root";
import { useForceRerender } from "../../util";
import { getEventTimeInfo } from "../../util/video";
import { Spinner } from "../Spinner";
import { RelativeDate } from "../time";
import PaellaPlayer from "./Paella";
import { COLORS } from "../../color";


export type PlayerProps = {
    event: PlayerEvent;

    /** A function to execute when an event goes from pending to live or from live to ended. */
    onEventStateChange?: () => void;

    className?: string;
};

export type PlayerEvent = {
    title: string;
    created: string;
    isLive: boolean;
    syncedData: {
        updated: string;
        startTime: string | null;
        endTime: string | null;
        duration: number;
        tracks: readonly Track[];
        captions: readonly Caption[];
        thumbnail: string | null;
    };
};

export type Track = {
    uri: string;
    flavor: string;
    mimetype: string | null;
    resolution: readonly number[] | null;
    isMaster: boolean | null;
};

export type Caption = {
    uri: string;
    lang: string | null;
};

/**
 * Video player.
 *
 * This is currently always Paella, but we once had two players that were used
 * depending on the number of tracks. For now we removed the other player, but
 * we might have multiple players in the future again. That's the reason for
 * leaving a bit of the "dispatch" logic in place.
 */
export const Player: React.FC<PlayerProps> = ({ event, onEventStateChange }) => {
    const { startTime, endTime, hasStarted, hasEnded } = getEventTimeInfo(event);
    const rerender = useForceRerender();

    // When the livestream starts or ends, rerender the parent. We add some
    // extra time (500ms) to be sure the stream is actually already running by
    // that time.
    useEffect(() => {
        const handler = () => {
            rerender();
            onEventStateChange?.();
        };

        const handles: ReturnType<typeof setTimeout>[] = [];
        if (event.isLive && hasStarted === false) {
            handles.push(setTimeout(handler, delayTill(startTime)));
        }
        if (event.isLive && hasEnded === false) {
            handles.push(setTimeout(handler, delayTill(endTime)));
        }
        return () => handles.forEach(clearTimeout);
    });

    return (
        <Suspense fallback={<PlayerFallback image={event.syncedData.thumbnail} />}>
            {event.isLive && (hasStarted === false || hasEnded === true)
                ? <LiveEventPlaceholder {...{
                    ...hasStarted === false
                        ? { mode: "pending", startTime }
                        : { mode: "ended" },
                }} />
                : <LoadPaellaPlayer
                    {...event}
                    {...event.syncedData}
                    previewImage={event.syncedData.thumbnail}
                />}
        </Suspense>
    );
};

/**
 * Returns the duration till `date` as a value suitable for putting into
 * `setTimeout`. We have to do a special treatment as `setTimeout`
 * immediately executes the handler if the number is bigger than 2^31.
 */
const delayTill = (date: Date): number => {
    const raw = date.getTime() - Date.now() + 500;
    return Math.min(raw, 2_147_483_647);
};

/**
 * A more constrained version of the player component for use in normal page flow.
 * You probably want this one.
 */
export const InlinePlayer: React.FC<PlayerProps> = ({ className, event, ...playerProps }) => {
    const aspectRatio = getPlayerAspectRatio(event.syncedData.tracks);
    const isDark = useColorScheme().scheme === "dark";

    return (
        <div className={className} css={{
            "--video-container-background-color": COLORS.neutral10,
            "--base-video-rect-background-color": COLORS.neutral10,
            "div.loader-container": {
                backgroundColor: isDark ? COLORS.neutral20 : "inherit",
            },
            "div.preview-container": {
                backgroundColor: `${COLORS.neutral15} !important`,
                "div, div img": {
                    height: "inherit",
                },
                "div img": {
                    display: "block",
                    margin: "0 auto",
                    width: "unset !important",
                },
            },
            display: "flex",
            flexDirection: "column",
            // We want to be able to see the full header, the video title and some metadata.
            // So: full height minus header, minus separation line (18px), minus main
            // padding (16px), minus breadcrumbs (roughly 42px), minus the amount of space
            // we want to see below the video (roughly 120px).
            maxHeight: "calc(100vh - var(--header-height) - 18px - 16px - 42px - 120px)",
            minHeight: 180,
            width: "100%",
            aspectRatio: `${aspectRatio[0]} / ${aspectRatio[1]}`,

            // If the player gets too small, the controls are pretty crammed, so
            // we use all available width.
            [screenWidthAtMost(380)]: {
                margin: `0 -${MAIN_PADDING}px`,
                width: `calc(100% + ${2 * MAIN_PADDING}px)`,
            },
        }}>
            <Player {...{ event, ...playerProps }} />
        </div>
    );
};

/**
 * Finds a suitable aspect ratio for our height/width limiting below. For events
 * with multiple streams, we just use 16:9 because it's unclear what else we
 * should use with multi stream video.
 */
export const getPlayerAspectRatio = (tracks: readonly Track[]): [number, number] => {
    const flavors = new Set(tracks.map(t => t.flavor));
    const default_: [number, number] = [16, 9];
    return flavors.size > 1
        ? default_
        : tracks[0].resolution as [number, number] ?? default_;
};


const LoadPaellaPlayer = PaellaPlayer;

/**
 * Suspense fallback while the player JS files are still loading. This is
 * completely unused right now as the player code is embedded in the main
 * bundle. Splitting the bundle is tracked by #257.
 */
const PlayerFallback: React.FC<{ image: string | null }> = ({ image }) => {
    const { t } = useTranslation();

    return (
        <div css={{
            position: "relative",
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
        }}>
            {image && <img src={image} css={{
                objectFit: "cover",
                opacity: 0.5,
                position: "absolute",
                width: "100%",
                height: "100%",
            }} />}
            <div css={{
                zIndex: 10,
                padding: 16,
                minWidth: 140,
                textAlign: "center",
                borderRadius: 4,
                backgroundColor: "rgba(255 255 255 / 50%)",
                border: "1px solid rgba(255 255 255 / 15%)",
                "@supports(backdrop-filter: none)": {
                    backgroundColor: "rgba(255 255 255 / 10%)",
                    backdropFilter: "blur(5px)",
                },
            }}>
                <Spinner size={32} />
                <div css={{ marginTop: 8 }}>{t("loading")}</div>
            </div>
        </div>
    );
};

export const isHlsTrack = (t: Track) =>
    t.mimetype === "application/x-mpegURL" || t.uri.endsWith(".m3u8");


export const PlayerPlaceholder: React.FC<PropsWithChildren> = ({ children }) => {
    const isDark = useColorScheme().scheme === "dark";
    return <div css={{
        height: "100%",
        backgroundColor: isDark ? COLORS.neutral15 : COLORS.neutral80,
        color: "white",
        padding: 8,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "5%",
        textAlign: "center",
        "& > svg": {
            fontSize: 40,
            margin: "16px 0",
            strokeWidth: 1.5,
            ...isDark && { color: COLORS.neutral80 },
        },
        div: {
            ...isDark && { color: COLORS.neutral80 },
        },
        [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
            "& > *": {
                transform: "scale(0.8)",
            },
        },
    }}>
        {children}
    </div>;
};

type LiveEventPlaceholderProps =
    | { mode: "pending"; startTime: Date }
    | { mode: "ended" };

const LiveEventPlaceholder: React.FC<LiveEventPlaceholderProps> = props => {
    const { t } = useTranslation();

    return <PlayerPlaceholder>
        {match(props.mode, {
            "pending": () => <>
                <FiClock />
                <div>{t("video.stream-not-started-yet")}</div>
            </>,
            "ended": () => <>
                <HiOutlineStatusOffline />
                <div>{t("video.stream-ended")}</div>
            </>,
        })}
        {props.mode === "pending" && (
            <div css={{
                backgroundColor: "black",
                borderRadius: 4,
                padding: "8px 16px",
            }}>
                <RelativeDate date={props.startTime} isLive />
            </div>
        )}
    </PlayerPlaceholder>;
};
