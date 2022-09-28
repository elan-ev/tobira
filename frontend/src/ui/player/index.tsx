import React, { Suspense, useEffect } from "react";
import { Trans, useTranslation } from "react-i18next";
import { FiClock } from "react-icons/fi";
import { HiOutlineStatusOffline } from "react-icons/hi";
import { BREAKPOINT_MEDIUM } from "../../GlobalStyle";

import { MAIN_PADDING } from "../../layout/Root";
import { match, useForceRerender } from "../../util";
import { getEventTimeInfo } from "../../util/video";
import { Spinner } from "../Spinner";
import { RelativeDate } from "../time";
import PaellaPlayer from "./Paella";


export type PlayerProps = {
    event: PlayerEvent;

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
        thumbnail: string | null;
    };
};

export type Track = {
    uri: string;
    flavor: string;
    mimetype: string | null;
    resolution: readonly number[] | null;
};

/**
 * Video player.
 *
 * This is currently always Paella, but we once had two players that were used
 * depending on the number of tracks. For now we removed the other player, but
 * we might have multiple players in the future again. That's the reason for
 * leaving a bit of the "dispatch" logic in place.
 */
export const Player: React.FC<PlayerProps> = ({ event, className }) => {
    const aspectRatio = getPlayerAspectRatio(event.syncedData.tracks);
    const { startTime, endTime, hasStarted, hasEnded } = getEventTimeInfo(event);
    const rerender = useForceRerender();

    // When the livestream starts or ends, rerender the parent. We add some
    // extra time (500ms) to be sure the stream is actually already running by
    // that time.
    useEffect(() => {
        const handles: ReturnType<typeof setTimeout>[] = [];
        if (event.isLive && hasStarted === false) {
            handles.push(setTimeout(rerender, startTime.getTime() - Date.now() + 500));
        }
        if (event.isLive && hasEnded === false) {
            handles.push(setTimeout(rerender, endTime.getTime() - Date.now() + 500));
        }
        return () => handles.forEach(clearTimeout);
    });

    return (
        <PlayerContainer {...{ className, aspectRatio }}>
            <Suspense fallback={<PlayerFallback image={event.syncedData.thumbnail} />}>
                {event.isLive && (hasStarted === false || hasEnded === true)
                    ? <LiveEventPlaceholder {...{
                        aspectRatio,
                        ...hasStarted === false
                            ? { mode: "pending", startTime }
                            : { mode: "ended" },
                    }} />
                    : <LoadPaellaPlayer
                        title={event.title}
                        duration={event.syncedData.duration}
                        isLive={event.isLive}
                        tracks={event.syncedData.tracks}
                    />}
            </Suspense>
        </PlayerContainer>
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

export type PlayerContainerProps = React.PropsWithChildren<{
    className?: string;
    aspectRatio: [number, number];
}>;

export const PlayerContainer: React.FC<PlayerContainerProps> = ({
    className,
    aspectRatio,
    children,
}) => (
    <div className={className} css={{
        // We want to make sure that the player does not take up all the
        // vertical and horizontal page, as this could make scrolling hard.
        // And if users want that, there is a fullscreen mode for a reason.
        // So here we just say: there should be always 10% + 80px of
        // vertical space left (not taken up by the player). The height of
        // the players is actually best controlled by setting the width.
        "--ideal-max-width": `calc((90vh - 80px) * ${aspectRatio[0] / aspectRatio[1]})`,
        maxWidth: "min(100%, var(--ideal-max-width))",
        minWidth: "320px",
        aspectRatio: `${aspectRatio[0]} / ${aspectRatio[1]}`,

        // If the player gets too small, the controls are pretty crammed, so
        // we use all available width.
        "@media (max-width: 380px)": {
            margin: `0 -${MAIN_PADDING}px`,
            maxWidth: `min(100% + ${2 * MAIN_PADDING}px, var(--ideal-max-width))`,
        },
    }}>{children}</div>
);


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


type LiveEventPlaceholderProps = {
    aspectRatio: [number, number];
} & (
    { mode: "pending"; startTime: Date }
    | { mode: "ended" }
);

const LiveEventPlaceholder: React.FC<LiveEventPlaceholderProps> = props => {
    const { t } = useTranslation();

    return (
        <div css={{
            height: "100%",
            backgroundColor: "var(--grey20)",
            color: "white",
            padding: 8,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "5%",
            [`@media (max-width: ${BREAKPOINT_MEDIUM}px)`]: {
                "& > *": {
                    transform: "scale(0.8)",
                },
            },
        }}>
            <div css={{
                textAlign: "center",
                "& > svg": {
                    fontSize: 40,
                    margin: "16px 0",
                    strokeWidth: 1.5,
                },
            }}>
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
            </div>
            {props.mode === "pending" && (
                <div css={{
                    backgroundColor: "black",
                    borderRadius: 4,
                    padding: "8px 16px",
                }}>
                    <Trans i18nKey={"video.starts-in"}>
                        Starts <RelativeDate date={props.startTime} />
                    </Trans>
                </div>
            )}
        </div>
    );
};
