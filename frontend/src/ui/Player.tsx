import React from "react";
import Plyr from "plyr-react";
import plyrCss from "plyr/dist/plyr.css";
import { Global } from "@emotion/core";

import CONFIG from "../config";
import { MAIN_PADDING } from "../layout/Root";
import { HEIGHT as HEADER_HEIGHT } from "../layout/Header";


type PlayerProps = {
    mediaUrl: string;

    /**
     * `true` if this player appears on some content block. `false` if the
     * player is on the dedicated player page. A `false` just leads to the
     * player taking up more screen space, growing larger than its parent
     * container. Defaults to `false`.
     */
    embedded?: boolean;
};

export const Player: React.FC<PlayerProps> = ({ mediaUrl, embedded = false }) => {
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

            ...!embedded && {
                // If this lives on the player page, we want to take the whole
                // screen width and ignore the padding of the main container.
                margin: `-${MAIN_PADDING}px -${MAIN_PADDING}px 0 -${MAIN_PADDING}px`,

                // We want to make sure that there is at least a bit of the content
                // below the video player visible.
                "& video": {
                    maxHeight: `calc(100vh - ${HEADER_HEIGHT}px - 80px)`,
                    minHeight: 130,
                },
                "& .plyr:fullscreen video": { maxHeight: "initial" },
            },
        }}>
            <Plyr source={source} options={options} />
        </div>
    </>;
};
