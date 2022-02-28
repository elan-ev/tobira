import React from "react";
import Plyr from "plyr-react";
import plyrCss from "plyr/dist/plyr.css";
import { Global } from "@emotion/react";

import CONFIG from "../../config";
import { PlayerProps } from ".";
import { SPEEDS } from "./consts";


const PlyrPlayer: React.FC<PlayerProps> = ({ tracks, title }) => {
    const source = {
        type: "video" as const,
        title,
        sources: tracks.map(track => ({
            src: track.uri,
            type: track.mimetype ?? undefined,
            size: track.resolution?.[1] ?? undefined,
        })),
    };

    // Determine all available qualities. As default quality, we use the largest
    // one equal to or below 1080. 1080p is a good default, at least for
    // desktops. And once the user changes the quality, it is stored in local
    // storage anyway.
    const qualities = Array.from(new Set(
        tracks
            .map(t => t.resolution?.[1])
            .filter((h): h is number => h != null),
    ));
    qualities.sort((a, b) => a - b);
    const defaultQuality = Math.max(...qualities.filter(h => h <= 1080));

    const aspectRatio = tracks[0].resolution ?? [16, 9];
    const aspectRatioNum = aspectRatio[0] / aspectRatio[1];

    const options = {
        // Compared to the default, "pip" and "airplay" were removed.
        controls: [
            // TODO: maybe remove "player-large" -> it's bad for pausing lecture recordings
            "play-large",
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

    return <>
        <Global styles={plyrCss} />
        <div css={{
            "--plyr-color-main": "var(--accent-color)",

            // We want to make sure that the video player never takes up too
            // much height in the viewport. That could make scrolling hard or
            // somewhat hide that there is still content below it. The Plyr
            // player can be best resized by changing its width, the height
            // will follow automatically according to the aspect ratio.
            //
            // I'm not 100% sure all of this is necessary or good. So we might
            // still rip it out.
            "& > div": {
                maxWidth: `calc((90vh - var(--outer-header-height) - 80px) * ${aspectRatioNum})`,
                minWidth: "320px",
                margin: "auto",
            },
        }}>
            <Plyr source={source} options={options} />
        </div>
    </>;
};

export default PlyrPlayer;
