import React, { Suspense } from "react";
import { useTranslation } from "react-i18next";

import { MAIN_PADDING } from "../../layout/Root";
import { Spinner } from "../Spinner";
import PaellaPlayer from "./Paella";


export type PlayerProps = {
    coverImage: string | null;
    title: string;
    duration: number;
    tracks: Track[];
    className?: string;
    isLive: boolean;
};

export type Track = {
    uri: string;
    flavor: string;
    mimetype: string | null;
    resolution: number[] | null;
};

/**
 * Video player.
 *
 * This is currently always Paella, but we once had two players that were used
 * depending on the number of tracks. For now we removed the other player, but
 * we might have multiple players in the future again. That's the reason for
 * leaving a bit of the "dispatch" logic in place.
 */
export const Player: React.FC<PlayerProps> = ({
    className,
    tracks,
    coverImage,
    title,
    duration,
    isLive,
}) => {
    const aspectRatio = getPlayerAspectRatio(tracks);
    return (
        <PlayerContainer {...{ className, aspectRatio }}>
            <Suspense fallback={<PlayerFallback image={coverImage} />}>
                <LoadPaellaPlayer {...{ duration, title, tracks, isLive }} />
            </Suspense>
        </PlayerContainer>
    );
};

/**
 * Finds a suitable aspect ratio for our height/width limiting below. For events
 * with multiple streams, we just use 16:9 because it's unclear what else we
 * should use with multi stream video.
 */
export const getPlayerAspectRatio = (tracks: Track[]): [number, number] => {
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
