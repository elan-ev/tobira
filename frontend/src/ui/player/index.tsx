import React, { Suspense } from "react";
import { MAIN_PADDING } from "../../layout/Root";

export type PlayerProps = {
    title: string;
    duration: number;
    tracks: Track[];
};

export type Track = {
    uri: string;
    flavor: string;
    mimetype: string | null;
    resolution: number[] | null;
};

export const Player: React.FC<PlayerProps> = props => {
    const flavors = new Set(props.tracks.map(t => t.flavor));
    const usePaella = flavors.size > 1;

    // Find a suitable aspect ratio for our height/width limiting below. For
    // Paella, we just use 16:9 because it's unclear what else we should use
    // with multi stream video.
    const aspectRatio = usePaella ? [16, 9] : props.tracks[0].resolution ?? [16, 9];

    return (
        <div css={{
            // We want to make sure that the player does not take up all the
            // vertical and horizontal page, as this could make scrolling hard.
            // And if users want that, there is a fullscreen mode for a reason.
            // So here we just say: there should be always 10% + 80px of
            // vertical space left (not taken up by the player). The height of
            // the players is actually best controlled by setting the width.
            maxWidth: `calc((90vh - 80px) * ${aspectRatio[0] / aspectRatio[1]})`,
            minWidth: "320px",
            margin: "auto",
            aspectRatio: `${aspectRatio[0]} / ${aspectRatio[1]}`,

            // If the player gets too small, the controls are pretty crammed, so
            // we used all available width.
            "@media (max-width: 380px)": {
                margin: `0 -${MAIN_PADDING}px`,
            },
        }}>
            <Suspense fallback={<PlayerFallback />}>
                {usePaella ? <LoadPaellaPlayer {...props} /> : <LoadPlyrPlayer {...props} />}
            </Suspense>
        </div>
    );
};

const LoadPaellaPlayer = React.lazy(() => import(/* webpackChunkName: "paella" */ "./Paella"));
const LoadPlyrPlayer = React.lazy(() => import(/* webpackChunkName: "plyr" */ "./Plyr"));

const PlayerFallback: React.FC = () => <div>Player loading...</div>;
