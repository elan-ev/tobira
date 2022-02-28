import React, { Suspense } from "react";

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
    return (
        <Suspense fallback={<PlayerFallback />}>
            {flavors.size === 1 ? <LoadPlyrPlayer {...props} /> : <LoadPaellaPlayer {...props} />}
        </Suspense>
    );
};

const LoadPaellaPlayer = React.lazy(() => import(/* webpackChunkName: "paella" */ "./Paella"));
const LoadPlyrPlayer = React.lazy(() => import(/* webpackChunkName: "plyr" */ "./Plyr"));

const PlayerFallback: React.FC = () => <div>Player loading...</div>;
