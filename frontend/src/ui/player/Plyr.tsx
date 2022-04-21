import React, { useEffect, useId, useRef } from "react";
import Plyr from "plyr-react";
import plyrCss from "plyr/dist/plyr.css";
import { Global } from "@emotion/react";
import Hls from "hls.js";

import CONFIG from "../../config";
import { isHlsTrack, Track } from ".";
import { SPEEDS } from "./consts";


type PlyrPlayerProps = {
    title: string;
    tracks: Track[];
    isLive: boolean;
};

const PlyrPlayer: React.FC<PlyrPlayerProps> = ({ tracks, title, isLive }) => {
    // Check if there is any HLS track. If so, we only care about that and
    // ignore all other tracks.
    // TODO: it's unclear what we want to do in case of multiple HLS tracks. In
    // theory, you shouldn't need multiple as the m3u8 playlist can list
    // multiple qualities.
    const hlsTrack = tracks.find(isHlsTrack);

    const source = {
        type: "video" as const,
        title,
        sources: hlsTrack ? [] : tracks.map(track => ({
            src: track.uri,
            type: track.mimetype ?? undefined,
            size: track.resolution?.[1] ?? undefined,
        })),
    };

    // Determine all available qualities. As default quality, we use the largest
    // one equal to or below 1080. 1080p is a good default, at least for
    // desktops. And once the user changes the quality, it is stored in local
    // storage anyway.
    //
    // When we use a HLS track, this setting is completely ignored, so we can
    // still just pass it.
    const qualities = Array.from(new Set(
        tracks
            .map(t => t.resolution?.[1])
            .filter((h): h is number => h != null),
    ));
    qualities.sort((a, b) => a - b);
    const defaultQuality = Math.max(...qualities.filter(h => h <= 1080));

    const aspectRatio = tracks[0].resolution ?? [16, 9];

    const options = {
        // Compared to the default, "pip" and "airplay" were removed.
        controls: [
            "play",
            "progress",
            "current-time",
            "mute",
            "volume",
            "captions",
            "settings",
            "fullscreen",
        ],
        settings: ["captions", "quality", "speed"],
        quality: {
            default: defaultQuality,
            options: qualities,
        },
        speed: {
            selected: 1,
            options: SPEEDS,
        },
        invertTime: false,
        blankVideo: CONFIG.plyr.blankVideo,
        iconUrl: CONFIG.plyr.svg,

        // Set ratio to avoid visual jumps. I'm slightly uncomfortable doing
        // that as the reported resolution could be garbage and the user will
        // be stuck with an incorrect aspect ratio. I would like to give the
        // video preference once it's loaded. But for not we just assume the
        // resolution is correct.
        ratio: `${aspectRatio[0]}:${aspectRatio[1]}`,
    };

    // Unfortunately, `plyr-react` does not seem to offer a way to access the
    // `<video>` element via `ref`. So we just use a unique random ID.
    const elementId = useId();

    // Setup HLS if we have an HLS track.
    const hlsRef = useRef<Hls | null>(null);
    const loadHls = async () => {
        if (hlsTrack !== undefined) {
            if (!Hls.isSupported()) {
                // TODO: improve this. It's fine for now as browsers that don't
                // support hls.js are very rare by now.
                throw new Error("HLS is not supported, but required to play this video");
            }

            const videoElement = document.getElementById(elementId) as HTMLVideoElement;
            hlsRef.current = new Hls();
            const hls = hlsRef.current;
            hls.loadSource(hlsTrack.uri);
            hls.attachMedia(videoElement);

            // If this is a live event (and not a VOD HLS stream), we want to
            // auto-play. Of course, most browsers block that if the user has
            // not interacted with the website before. But that's fine.
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                if (isLive) {
                    videoElement.play();
                }
            });
        }
    };
    useEffect(() => {
        loadHls();
        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
            }
        };
    });

    return <>
        <Global styles={plyrCss} />
        <div css={{
            "--plyr-color-main": "var(--accent-color)",
            "& > div:focus-visible": {
                outline: "3px dotted var(--accent-color)",
            },
        }}>
            <Plyr id={elementId} source={source} options={options} />
        </div>
    </>;
};

export default PlyrPlayer;
