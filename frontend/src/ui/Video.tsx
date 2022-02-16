import { keyframes } from "@emotion/react";
import { FiFilm, FiPlay, FiVolume2 } from "react-icons/fi";


type ThumbnailProps = JSX.IntrinsicElements["div"] & {
    /** The event of which a thumbnail should be shown */
    event: {
        thumbnail: string | null;
        duration: number;
        tracks: readonly { resolution: readonly number[] | null }[];
    };

    /** If `true`, an indicator overlay is shown */
    active?: boolean;
};

export const Thumbnail: React.FC<ThumbnailProps> = ({
    event,
    active = false,
    ...rest
}) => {
    const audioOnly = event.tracks.every(t => t.resolution == null);

    let inner;
    if (event.thumbnail != null) {
        // We have a proper thumbnail.
        inner = <img
            src={event.thumbnail}
            width={16}
            height={9}
            css={{ display: "block", width: "100%", height: "auto" }}
        />;
    } else {
        // We have no thumbnail. If the resolution is `null` as well, we are
        // dealing with an audio-only event and show an appropriate icon.
        // Otherwise we use a generic icon.
        const icon = audioOnly ? <FiVolume2 /> : <FiFilm />;

        inner = (
            <div css={{
                display: "flex",
                height: "100%",
                backgroundColor: "var(--grey92)",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 40,
            }}>{icon}</div>
        );
    }

    return (
        <div css={{
            position: "relative",
            boxShadow: "0 0 4px var(--grey92)",
            transition: "0.2s box-shadow",
            overflow: "hidden",
            height: "fit-content",
            borderRadius: 4,
            // TODO: Not supported by Safari 14.1. Maybe used padding trick instead!
            aspectRatio: "16 / 9",
        }} {...rest}>
            {inner}
            {active && <ActiveIndicator />}
            <div css={{
                position: "absolute",
                right: 6,
                bottom: 6,
                backgroundColor: "hsla(0, 0%, 0%, 0.75)",
                border: "1px solid black",
                borderRadius: 4,
                padding: "0 4px",
                color: "white",
                fontSize: 14,
            }}>{formatDuration(event.duration)}</div>
        </div>
    );
};

const ActiveIndicator = () => {
    const animation = keyframes({
        "0%": { color: "black" },
        "50%": { color: "var(--accent-color-darker)" },
        "100%": { color: "black" },
    });

    return (
        <div css={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(255, 255, 255, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 64,
            "& > svg": {
                animation: `${animation} 3s infinite`,
            },
        }}>
            <FiPlay />
        </div>
    );
};


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
