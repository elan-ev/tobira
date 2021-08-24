import React from "react";

import { PaellaPlayer } from "./Paella";
import { PlyrPlayer } from "./Plyr";


export type PlayerProps = {
    tracks: Track[];
};

export type Track = {
    uri: string;
    flavor: string;
    mimetype: string | null;
    resolution: number[] | null;
};

export const Player: React.FC<PlayerProps> = ({ tracks }) => {
    const flavors = new Set(tracks.map(t => t.flavor));
    return flavors.size === 1
        ? <PlyrPlayer tracks={tracks} />
        : <PaellaPlayer tracks={tracks} />;
};
