import React from "react";
import Plyr from "plyr-react";
import plyrCss from "plyr/dist/plyr.css";
import { Global } from "@emotion/react";

import CONFIG from "../config";


type PlayerProps = {
    mediaUrl: string;
};

export const Player: React.FC<PlayerProps> = ({ mediaUrl }) => {
    const source = {
        type: "video" as const,
        sources: [
            {
                src: mediaUrl,
            },
        ],
    };

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
        blankVideo: CONFIG.plyr.blankVideo,
        iconUrl: CONFIG.plyr.svg,

        // TODO:
        // - `duration`
        // - `aspectRatio`
        //
        // We (will) know these things about the videos, setting them here will
        // lead to less visual jumps and also earlier duration information.
    };

    return <>
        <Global styles={plyrCss} />
        <div css={{
            // TODO: here we need to adjust the colors of the player based on
            // the colors from the configuration.

            // We want to make sure that the video player never takes up too
            // much height in the viewport. That could make scrolling hard or
            // somewhat hide that there is still content below it. The Plyr
            // player can be best resized by changing its width, the height
            // will follow automatically according to the aspect ratio.
            //
            // I'm not 100% sure all of this is necessary or good. So we might
            // still rip it out.
            "& > div": {
                // TODO: replace with real aspect ratio
                maxWidth: "calc((80vh - var(--header-height)) * 1.777)",
                minWidth: "max(50%, 320px)",
                margin: "auto",
            },
        }}>
            <Plyr source={source} options={options} />
        </div>
    </>;
};
